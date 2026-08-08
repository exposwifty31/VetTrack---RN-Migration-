/**
 * Locks the decision mutation contract (Slice 11): approve/edit/reject call
 * their endpoint with the right args and invalidate the proposals key on
 * success; a failure surfaces via mutation state and does NOT invalidate (plain
 * invalidate-on-success, no optimistic flip to roll back).
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useProposalDecisions } from "../useProposalDecisions";

const mockApprove = jest.fn();
const mockEdit = jest.fn();
const mockReject = jest.fn();

jest.mock("@/lib/api/action-proposals", () => ({
  proposalKeys: { all: ["action-proposals"] },
  actionProposalsApi: {
    approve: (id: string) => mockApprove(id),
    edit: (id: string, editedContent: Record<string, unknown>) => mockEdit(id, editedContent),
    reject: (id: string, rejectionReason: string) => mockReject(id, rejectionReason),
  },
}));

const PROPOSALS_KEY = ["action-proposals"];

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe("useProposalDecisions", () => {
  beforeEach(() => {
    mockApprove.mockReset();
    mockEdit.mockReset();
    mockReject.mockReset();
  });

  it("approve calls the endpoint and invalidates the proposals key", async () => {
    mockApprove.mockResolvedValue({ id: "p1", status: "approved" });
    const queryClient = newClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useProposalDecisions(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.approve.mutateAsync("p1");
    });

    expect(mockApprove).toHaveBeenCalledWith("p1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROPOSALS_KEY });
  });

  it("reject calls the endpoint with the reason and invalidates", async () => {
    mockReject.mockResolvedValue({ id: "p1", status: "rejected" });
    const queryClient = newClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useProposalDecisions(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.reject.mutateAsync({ id: "p1", rejectionReason: "not needed" });
    });

    expect(mockReject).toHaveBeenCalledWith("p1", "not needed");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROPOSALS_KEY });
  });

  it("edit calls the endpoint with the editedContent and invalidates", async () => {
    mockEdit.mockResolvedValue({ id: "p1", status: "edited" });
    const queryClient = newClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useProposalDecisions(), {
      wrapper: makeWrapper(queryClient),
    });

    const editedContent = { driftType: "stale_check", note: "done" };
    await act(async () => {
      await result.current.edit.mutateAsync({ id: "p1", editedContent });
    });

    expect(mockEdit).toHaveBeenCalledWith("p1", editedContent);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROPOSALS_KEY });
  });

  it("a failed approve surfaces the error and does not invalidate", async () => {
    mockApprove.mockRejectedValue(new Error("already decided"));
    const queryClient = newClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = await renderHook(() => useProposalDecisions(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.approve.mutateAsync("p1")).rejects.toThrow("already decided");
    });

    await waitFor(() => expect(result.current.approve.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
