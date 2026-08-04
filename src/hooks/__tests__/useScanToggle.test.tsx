/**
 * Locks the optimistic-with-rollback contract for the scan mutation:
 *   - onMutate flips the target row in the cached list page (perceived <100ms path),
 *   - a `conflict` result rolls the flip back,
 *   - an `ok` result reconciles the detail cache to the server row.
 * This is the test whose absence let the earlier cache-shape mismatch slide.
 *
 * We mock `authFetch` (not `@/lib/api`) so the REAL `api.equipment.scan` runs its
 * status→variant mapping — the same seam the api shape test uses.
 */
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-request-id" }));
jest.mock("@/lib/haptics", () => ({
  haptics: { scanSuccess: jest.fn(), error: jest.fn(), tap: jest.fn() },
}));
jest.mock("@/lib/instrumentation/perf", () => ({
  mark: jest.fn(),
  MARK: {
    scanTap: "scan_tap",
    scanVisualAck: "scan_visual_ack",
    scanServerConfirmed: "scan_server_confirmed",
    screenInteractive: "screenInteractive",
  },
}));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { equipmentKeys } from "@/lib/api";
import type { EquipmentListPage, EquipmentRow } from "@/types/api";

import { useScanToggle } from "../useScanToggle";

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function seededRow(): EquipmentRow {
  return { id: "eq1", name: "Ultrasound", status: "available", custodyState: "available", version: 1 };
}

function seededPage(): EquipmentListPage {
  return { items: [seededRow()], total: 1, page: 1, pageSize: 20, hasMore: false };
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

async function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(equipmentKeys.list(), seededPage());
  queryClient.setQueryData(equipmentKeys.detail("eq1"), seededRow());
  const view = await renderHook(() => useScanToggle(), { wrapper: makeWrapper(queryClient) });
  return { queryClient, view };
}

function cachedCustody(queryClient: QueryClient): string | undefined {
  const page = queryClient.getQueryData<EquipmentListPage>(equipmentKeys.list());
  return page?.items[0]?.custodyState;
}

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("useScanToggle", () => {
  it("optimistically flips the cached list row on mutate, then settles on ok", async () => {
    const { queryClient, view } = await setup();
    // Deferred response so the optimistic state is observable before settle.
    let resolveFetch: (r: Response) => void = () => {};
    mockAuthFetch.mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve)));

    view.result.current.mutate("eq1");
    await waitFor(() => expect(cachedCustody(queryClient)).toBe("checked_out"));

    resolveFetch(
      fakeResponse(200, {
        equipment: { ...seededRow(), custodyState: "checked_out", version: 2 },
        action: "checkout",
        scanLogId: "log_1",
        undoToken: "undo_1",
      }),
    );
    await waitFor(() => expect(view.result.current.isPending).toBe(false));
  });

  it("rolls the flip back when the server returns a 409 conflict", async () => {
    const { queryClient, view } = await setup();
    mockAuthFetch.mockResolvedValue(
      fakeResponse(409, {
        code: "CONFLICT",
        reason: "EQUIPMENT_ALREADY_CHECKED_OUT",
        checkedOutByEmail: "other@clinic.test",
      }),
    );

    view.result.current.mutate("eq1");
    await waitFor(() => expect(view.result.current.isPending).toBe(false));
    expect(cachedCustody(queryClient)).toBe("available");
  });

  it("reconciles the detail cache to the server row on success", async () => {
    const { queryClient, view } = await setup();
    mockAuthFetch.mockResolvedValue(
      fakeResponse(200, {
        equipment: {
          id: "eq1",
          name: "Ultrasound",
          status: "in_use",
          custodyState: "checked_out",
          checkedOutByEmail: "me@clinic.test",
          version: 2,
        },
        action: "checkout",
        scanLogId: "log_1",
        undoToken: "undo_1",
      }),
    );

    view.result.current.mutate("eq1");

    await waitFor(() =>
      expect(queryClient.getQueryData<EquipmentRow>(equipmentKeys.detail("eq1"))?.version).toBe(2),
    );
  });
});
