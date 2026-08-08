/**
 * Shift Autopilot `action_proposal` domain types (G3 Slice 11).
 *
 * Mirrors the server row shape returned by `GET /api/action-proposals`
 * (verified against `server/schema/ops.ts` `ActionProposalRow` +
 * `server/lib/autopilot/action-proposal-types.ts`, read-only 2026-08-08).
 * jsonb columns arrive as parsed JSON; timestamps serialize to ISO strings.
 */

/** The 4 proposal kinds — server `ACTION_PROPOSAL_KINDS`, order-for-order. */
export const ACTION_PROPOSAL_KINDS = [
  "shift_handover_draft",
  "coordinator_reassign_off_roster",
  "restock_po_on_burn",
  "crash_cart_drift",
] as const;
export type ActionProposalKind = (typeof ACTION_PROPOSAL_KINDS)[number];

/** Lifecycle statuses — server `ACTION_PROPOSAL_STATUSES`. The queue lists `staged` only. */
export const ACTION_PROPOSAL_STATUSES = ["staged", "approved", "edited", "rejected"] as const;
export type ActionProposalStatus = (typeof ACTION_PROPOSAL_STATUSES)[number];

/** A single grounding fact a proposal is cited against. */
export type ActionProposalCitedFact = Readonly<{
  sourceId: string;
  sourceTable: string;
  kind: string;
  at: string;
}>;

/** One staged/decided proposal row (the UI reads staged rows only). */
export type ActionProposal = Readonly<{
  id: string;
  clinicId: string;
  kind: ActionProposalKind;
  status: ActionProposalStatus;
  sourceSessionId: string;
  summary: string;
  citedFacts: ActionProposalCitedFact[];
  /** Kind-specific AI draft; opaque here — never resent verbatim as editedContent. */
  draftContent: unknown;
  sourceRef: unknown;
  citationValidation?: unknown;
  editedContent: unknown | null;
  rejectionReason: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;
