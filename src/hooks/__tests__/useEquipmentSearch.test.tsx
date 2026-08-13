/**
 * Locks the shared search hook's fetch contract (CodeRabbit PR #58):
 * changing the search key must KEEP the previous page visible while the new
 * fetch resolves (`placeholderData: keepPreviousData`) instead of flashing the
 * loading state, and `dataUpdatedAt` must hold the last REAL sample time while
 * placeholder data shows (rows derive "seen X days ago" from it — a 0 would
 * fabricate epoch-relative ages).
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useEquipmentSearch } from "../useEquipmentSearch";
import type { EquipmentListPage } from "@/types/api";

const mockList = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    equipment: {
      list: (params?: unknown, etag?: string) => mockList(params, etag),
    },
  },
  // Mirrors src/lib/api.ts equipmentKeys.list: `{}` and no-params share one key.
  equipmentKeys: {
    list: (params?: Record<string, unknown>) =>
      params && Object.keys(params).length > 0
        ? (["equipment", "list", params] as const)
        : (["equipment", "list"] as const),
  },
}));

function page(name: string): EquipmentListPage {
  return {
    items: [
      {
        id: `id-${name}`,
        name,
        status: "ok",
        custodyState: "available",
        version: 1,
      } as unknown as EquipmentListPage["items"][number],
    ],
    total: 1,
    page: 1,
    pageSize: 1,
    hasMore: false,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useEquipmentSearch previous-page hold", () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it("keeps the previous items and a non-zero dataUpdatedAt while a new search key fetches", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    mockList
      .mockResolvedValueOnce({ status: 200, data: page("monitor") })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result } = await renderHook(() => useEquipmentSearch(""), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].name).toBe("monitor");
    const firstUpdatedAt = result.current.dataUpdatedAt;
    expect(firstUpdatedAt).toBeGreaterThan(0);

    await act(async () => {
      result.current.setQuery("pump");
    });

    // The deferred query flushes and the new key starts fetching…
    await waitFor(() => expect(mockList).toHaveBeenCalledWith({ q: "pump" }, undefined));

    // …but the PREVIOUS page stays visible (no loading flash) and the sample
    // time still reflects the last real fetch, never 0.
    expect(result.current.isPending).toBe(false);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("monitor");
    expect(result.current.dataUpdatedAt).toBe(firstUpdatedAt);

    await act(async () => {
      resolveSecond({ status: 200, data: page("pump") });
    });

    await waitFor(() => expect(result.current.items[0]?.name).toBe("pump"));
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });
});
