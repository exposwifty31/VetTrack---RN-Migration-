/**
 * Approve / edit / reject mutations for the Autopilot queue (G3 Slice 11).
 *
 * Deliberately NOT optimistic (G3-PLAN Slice 11 "optimistic-or-plain"): a
 * decision is a one-way server transition guarded on `status === "staged"`, and
 * SSE `audit_log` invalidation refreshes the queue anyway — a plain
 * invalidate-on-success avoids any rollback surface. Failures stay loud via
 * mutation state; the caller maps `ApiCodedError` to translated copy.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { actionProposalsApi, proposalKeys } from "@/lib/api/action-proposals";
import type { ActionProposal } from "@/types/action-proposals";

export type EditDecisionVars = Readonly<{ id: string; editedContent: Record<string, unknown> }>;
export type RejectDecisionVars = Readonly<{ id: string; rejectionReason: string }>;

export function useProposalDecisions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: proposalKeys.all });
  };

  const approve = useMutation<ActionProposal, Error, string>({
    mutationFn: (id) => actionProposalsApi.approve(id),
    onSuccess: invalidate,
  });

  const edit = useMutation<ActionProposal, Error, EditDecisionVars>({
    mutationFn: ({ id, editedContent }) => actionProposalsApi.edit(id, editedContent),
    onSuccess: invalidate,
  });

  const reject = useMutation<ActionProposal, Error, RejectDecisionVars>({
    mutationFn: ({ id, rejectionReason }) => actionProposalsApi.reject(id, rejectionReason),
    onSuccess: invalidate,
  });

  return { approve, edit, reject };
}
