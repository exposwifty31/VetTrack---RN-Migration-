/**
 * Action-proposals API module (G3 Slice 11) — the Shift Autopilot approval
 * queue. A new per-domain module under `src/lib/api/` (G3-PLAN §2 rule 3:
 * new domains never grow `api.ts`); it reuses the shared coded-error plumbing
 * (`ApiCodedError` / `requestJson`) so screens branch on the stable server
 * envelope code, never on copy.
 *
 * Server truth (verified 2026-08-08 against the vettrack repo, read-only —
 * `server/routes/action-proposals.ts`, mounted at `/api/action-proposals`):
 *   - GET  /                — lists rows for the caller's clinic, filterable by
 *     `status` + `kind`. Returns `{ proposals }` across ALL statuses, so the
 *     queue MUST pass `?status=staged` to avoid rendering decided rows.
 *   - POST /:id/approve     — body `z.object({}).strict()` → send `{}`.
 *   - POST /:id/edit        — body `{ editedContent: <plain object> }`,
 *     validated per-kind server-side (400 on shape mismatch).
 *   - POST /:id/reject      — body `{ rejectionReason: string (min 1) }`.
 *   All three decision routes are `requireAuth` + `actionProposalDecisionLimiter`
 *   (NO role floor — do not add a role gate or off-shift state). They carry NO
 *   idempotency middleware, so no `Idempotency-Key` header is sent.
 *   - Errors ride the apiError envelope `{ code, error, params? }`; 404 →
 *     `errors.notFound`, 409 → `errors.conflict` (already decided), 400 →
 *     `errors.validation` (edit shape). Surfaced as `ApiCodedError`.
 */
import { ApiCodedError, requestJson, retryUnlessClientError } from "@/lib/api/coded-error";
import type { ActionProposal } from "@/types/action-proposals";

export { ApiCodedError, retryUnlessClientError };

const BASE = "/api/action-proposals";

/** Canonical action-proposals query-key factory — everything nests under `all`. */
export const proposalKeys = {
  all: ["action-proposals"] as const,
  staged: () => ["action-proposals", "staged"] as const,
};

/**
 * Audit actionTypes that mean "the proposal queue changed" — the closed set
 * from `server/lib/audit.ts` (`action_proposal_staged|approved|edited|rejected`).
 * Proposals emit NO dedicated outbox domain events; these `audit_log` rows are
 * the sole SSE invalidation channel (the `/collab-ws` nudge has no RN client —
 * G3-PLAN seam §6.9).
 */
export const PROPOSAL_AUDIT_ACTION_TYPES = [
  "action_proposal_staged",
  "action_proposal_approved",
  "action_proposal_edited",
  "action_proposal_rejected",
] as const;

const JSON_HEADERS: Record<string, string> = { "Content-Type": "application/json" };

export const actionProposalsApi = {
  /** GET /api/action-proposals?status=staged — the human-review queue. */
  listStaged: async (): Promise<ActionProposal[]> => {
    const body = await requestJson<{ proposals: ActionProposal[] }>(`${BASE}?status=staged`);
    return body.proposals;
  },

  /** POST /:id/approve — empty strict body; flips status → approved. */
  approve: async (id: string): Promise<ActionProposal> => {
    const body = await requestJson<{ proposal: ActionProposal }>(
      `${BASE}/${encodeURIComponent(id)}/approve`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) },
    );
    return body.proposal;
  },

  /** POST /:id/edit — `{ editedContent }` (per-kind validated server-side). */
  edit: async (id: string, editedContent: Record<string, unknown>): Promise<ActionProposal> => {
    const body = await requestJson<{ proposal: ActionProposal }>(
      `${BASE}/${encodeURIComponent(id)}/edit`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ editedContent }) },
    );
    return body.proposal;
  },

  /** POST /:id/reject — `{ rejectionReason }` (server requires min length 1). */
  reject: async (id: string, rejectionReason: string): Promise<ActionProposal> => {
    const body = await requestJson<{ proposal: ActionProposal }>(
      `${BASE}/${encodeURIComponent(id)}/reject`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ rejectionReason }) },
    );
    return body.proposal;
  },
};
