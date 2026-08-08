/**
 * Pure derivations over the handover artifact — NO i18n, datetime, or RN
 * imports (the equipment-detail-derive precedent), so the unit test needs no
 * safe-storage / i18n mock and never drags Reanimated into jest.
 */
import type { HandoverArtifact, HandoverStaff } from "@/lib/api/shift-handover";

/**
 * The acknowledged signal is `acknowledgedAt` — the precise attestation flag
 * the two mutations set/clear together with `notificationReadAt`. The ack CTA
 * keys on the attestation, not the notification read-state (which other server
 * paths could plausibly move independently).
 */
export function isHandoverAcknowledged(
  handover: Pick<HandoverArtifact, "acknowledgedAt">,
): boolean {
  return handover.acknowledgedAt != null;
}

export type HandoverDeltaCounts = Readonly<{
  custody: number;
  taskState: number;
  alerts: number;
  dispenses: number;
  total: number;
}>;

/**
 * Per-dimension change counts for the document summary. Deltas are raw audit
 * rows with no server-side join (sourceId/kind/targetId only), so a count is
 * the honest ceiling of what can be rendered cleanly.
 */
export function handoverDeltaCounts(
  handover: Pick<HandoverArtifact, "deltas">,
): HandoverDeltaCounts {
  const { custody, taskState, alerts, dispenses } = handover.deltas;
  return {
    custody: custody.length,
    taskState: taskState.length,
    alerts: alerts.length,
    dispenses: dispenses.length,
    total: custody.length + taskState.length + alerts.length + dispenses.length,
  };
}

/** Resolve a worklist tech's clinic-scoped display name, or null if unmapped. */
export function resolveStaffName(
  staff: readonly HandoverStaff[],
  userId: string,
): string | null {
  return staff.find((member) => member.userId === userId)?.name ?? null;
}
