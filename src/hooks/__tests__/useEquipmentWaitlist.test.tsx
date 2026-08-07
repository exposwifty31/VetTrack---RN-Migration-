/**
 * Locks the waitlist mutation contract: join/leave call their endpoint, apply
 * the returned snapshot as the authoritative cache body, and invalidate the
 * waitlist key; failures surface via mutation state (no optimistic flip to
 * roll back — position is server-assigned).
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EquipmentWaitlistSnapshot } from "@vettrack/shared";

import { useEquipmentWaitlist } from "../useEquipmentWaitlist";

const mockWaitlist = jest.fn();
const mockJoin = jest.fn();
const mockLeave = jest.fn();

jest.mock("@/lib/api", () => ({
  equipmentKeys: {
    waitlist: (id: string) => ["equipment", "detail", id, "waitlist"] as const,
  },
  api: {
    equipment: {
      waitlist: (id: string) => mockWaitlist(id),
      joinWaitlist: (id: string) => mockJoin(id),
      leaveWaitlist: (id: string) => mockLeave(id),
    },
  },
}));

const WAITLIST_KEY = ["equipment", "detail", "eq1", "waitlist"];

function snapshot(overrides: Partial<EquipmentWaitlistSnapshot> = {}): EquipmentWaitlistSnapshot {
  return {
    equipmentId: "eq1",
    queueSize: 0,
    myPosition: null,
    myStatus: null,
    reservationExpiresAt: null,
    notifiedUserId: null,
    entries: [],
    ...overrides,
  };
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useEquipmentWaitlist", () => {
  beforeEach(() => {
    mockWaitlist.mockReset();
    mockJoin.mockReset();
    mockLeave.mockReset();
  });

  it("loads the snapshot under the waitlist key", async () => {
    mockWaitlist.mockResolvedValue(snapshot({ queueSize: 2 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = await renderHook(() => useEquipmentWaitlist("eq1"), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(mockWaitlist).toHaveBeenCalledWith("eq1");
    expect(queryClient.getQueryData(WAITLIST_KEY)).toMatchObject({ queueSize: 2 });
  });

  it("join applies the returned snapshot and invalidates the waitlist key", async () => {
    mockWaitlist.mockResolvedValue(snapshot());
    const joined = snapshot({ queueSize: 1, myPosition: 1, myStatus: "waiting" });
    mockJoin.mockImplementation(async () => {
      // After a successful join the SERVER snapshot is the joined one — the
      // onSettled invalidation refetch must observe the same fresh state.
      mockWaitlist.mockResolvedValue(joined);
      return joined;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useEquipmentWaitlist("eq1"), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.join.mutateAsync();
    });

    expect(mockJoin).toHaveBeenCalledWith("eq1");
    expect(queryClient.getQueryData(WAITLIST_KEY)).toMatchObject({ myPosition: 1, myStatus: "waiting" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WAITLIST_KEY });
  });

  it("leave applies the returned snapshot and invalidates the waitlist key", async () => {
    mockWaitlist.mockResolvedValue(snapshot({ queueSize: 1, myPosition: 1, myStatus: "waiting" }));
    const left = snapshot({ queueSize: 0 });
    mockLeave.mockImplementation(async () => {
      mockWaitlist.mockResolvedValue(left);
      return left;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useEquipmentWaitlist("eq1"), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await result.current.leave.mutateAsync();
    });

    expect(mockLeave).toHaveBeenCalledWith("eq1");
    expect(queryClient.getQueryData(WAITLIST_KEY)).toMatchObject({ queueSize: 0, myStatus: null });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WAITLIST_KEY });
  });

  it("a failed join leaves the cached snapshot untouched and surfaces the error", async () => {
    mockWaitlist.mockResolvedValue(snapshot({ queueSize: 3 }));
    mockJoin.mockRejectedValue(new Error("already joined"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = await renderHook(() => useEquipmentWaitlist("eq1"), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await expect(result.current.join.mutateAsync()).rejects.toThrow("already joined");
    });

    expect(queryClient.getQueryData(WAITLIST_KEY)).toMatchObject({ queueSize: 3 });
    await waitFor(() => expect(result.current.join.isError).toBe(true));
  });
});
