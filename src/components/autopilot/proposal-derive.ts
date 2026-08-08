/**
 * Pure proposal presentation + edit-body derivations (G3 Slice 11) — its own
 * module (the `equipment-row-status` / `tasks-derive` precedent) so it unit-tests
 * without the component tree or Reanimated.
 *
 * EDIT SCOPE (deliberate, owner-visible under the Grade-B Autopilot carve-out):
 * the server's per-kind `editedContent` schemas are heterogeneous and strict,
 * and `draftContent` does NOT round-trip as `editedContent` (it carries extra
 * fields a `.strict()` schema rejects). A mobile note-only edit yields a
 * schema-VALID body for exactly two kinds:
 *   - `coordinator_reassign_off_roster` — no per-kind schema (any plain object) → `{ note }`.
 *   - `crash_cart_drift` — `{ driftType, note? }`; `driftType` is read from the draft.
 * The other two are intentionally NOT editable from RN in G3:
 *   - `restock_po_on_burn` — strict `{ supplierName, lines }`, and edit fires a
 *     real PO-insert side effect (fix-then-execute) — too risky for a note field.
 *   - `shift_handover_draft` — strict nested delta-entry shape, fragile to
 *     reconstruct from the draft.
 * Approve / Reject still apply to all four kinds. Never render Edit for a kind
 * whose editedContent we cannot construct validly — a button that 400s is not honest.
 */
import type { ActionProposalKind } from "@/types/action-proposals";

/** The `autopilot.kind.*` label keys — a literal union so `t()` accepts them. */
export type ProposalKindLabelKey =
  | "autopilot.kind.shiftHandoverDraft"
  | "autopilot.kind.coordinatorReassign"
  | "autopilot.kind.restockPo"
  | "autopilot.kind.crashCartDrift";

/** Kind → i18n label key (`autopilot.kind.*`). Total over the closed kind enum. */
export const PROPOSAL_KIND_LABEL_KEY: Record<ActionProposalKind, ProposalKindLabelKey> = {
  shift_handover_draft: "autopilot.kind.shiftHandoverDraft",
  coordinator_reassign_off_roster: "autopilot.kind.coordinatorReassign",
  restock_po_on_burn: "autopilot.kind.restockPo",
  crash_cart_drift: "autopilot.kind.crashCartDrift",
};

export function proposalKindLabelKey(kind: ActionProposalKind): ProposalKindLabelKey {
  return PROPOSAL_KIND_LABEL_KEY[kind];
}

export type CrashCartDriftType = "missing_items" | "stale_check";

/** Read the required crash-cart `driftType` out of the opaque draft, or null. */
export function extractDriftType(draftContent: unknown): CrashCartDriftType | null {
  if (draftContent && typeof draftContent === "object") {
    const value = (draftContent as { driftType?: unknown }).driftType;
    if (value === "missing_items" || value === "stale_check") return value;
  }
  return null;
}

/**
 * True when a note-only edit produces a schema-valid `editedContent` for this
 * proposal — the sole gate for rendering the Edit affordance.
 */
export function isNoteEditable(kind: ActionProposalKind, draftContent: unknown): boolean {
  if (kind === "coordinator_reassign_off_roster") return true;
  if (kind === "crash_cart_drift") return extractDriftType(draftContent) !== null;
  return false;
}

/** Max note length — crash-cart's `editedContent.note` caps at 1000 server-side. */
export const NOTE_MAX_LENGTH = 1000;

/**
 * Build the minimal schema-valid `editedContent` from a human note. Returns
 * null when the note is blank or the kind isn't note-editable — the caller must
 * not POST in that case.
 */
export function buildEditedContent(
  kind: ActionProposalKind,
  draftContent: unknown,
  note: string,
): Record<string, unknown> | null {
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (kind === "coordinator_reassign_off_roster") return { note: trimmed };
  if (kind === "crash_cart_drift") {
    const driftType = extractDriftType(draftContent);
    if (!driftType) return null;
    return { driftType, note: trimmed };
  }
  return null;
}
