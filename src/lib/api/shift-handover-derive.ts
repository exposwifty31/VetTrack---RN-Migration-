/**
 * Pure derivations over the handover artifact — NO i18n, datetime, or RN
 * imports (the equipment-detail-derive precedent), so the unit test needs no
 * safe-storage / i18n mock and never drags Reanimated into jest.
 */
import type {
  HandoverArtifact,
  HandoverStaff,
  PatientWorklistErrorCode,
} from "@/lib/api/shift-handover";

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

/**
 * One heterogeneous row of the handover document, flattened for a single
 * top-level FlashList (rn-best-practices `list-performance-item-types`): the
 * unbounded `openItems` / worklist collections become recycled rows instead of
 * `.map`-mounting inside a ScrollView. Rows carry i18n KEYS (not resolved copy)
 * and pre-resolved staff names, so the builder stays a pure, mockless
 * derivation and the renderer owns only presentation. `techName` is carried
 * verbatim (may be Hebrew) — it is NOT LTR-isolated at render (RTL-first copy).
 */
export type HandoffListRow =
  | { key: string; type: "heading"; titleKey: "handoff.openItems.title" | "handoff.worklist.title" }
  | { key: string; type: "openItem"; summary: string }
  | {
      key: string;
      type: "worklistMessage";
      messageKey:
        | "handoff.worklist.notConfigured"
        | "handoff.worklist.error"
        | "handoff.worklist.empty";
      code: PatientWorklistErrorCode | null;
      tone: "muted" | "danger";
    }
  | {
      key: string;
      type: "worklistEntry";
      display: string;
      externalId: string;
      techName: string | null;
    };

/**
 * Flatten the artifact's document sections into the ordered FlashList data.
 * The open-items heading appears only when there are open items; the worklist
 * heading is always present, followed by either its state message or its rows.
 */
export function buildHandoffRows(handover: HandoverArtifact): HandoffListRow[] {
  const rows: HandoffListRow[] = [];

  if (handover.openItems.length > 0) {
    rows.push({ key: "openItems:heading", type: "heading", titleKey: "handoff.openItems.title" });
    for (const item of handover.openItems) {
      rows.push({ key: `openItem:${item.id}`, type: "openItem", summary: item.summary });
    }
  }

  rows.push({ key: "worklist:heading", type: "heading", titleKey: "handoff.worklist.title" });

  const worklist = handover.patientWorklist;
  if (worklist.state === "not_configured") {
    rows.push({
      key: "worklist:notConfigured",
      type: "worklistMessage",
      messageKey: "handoff.worklist.notConfigured",
      code: null,
      tone: "muted",
    });
  } else if (worklist.state === "error") {
    rows.push({
      key: "worklist:error",
      type: "worklistMessage",
      messageKey: "handoff.worklist.error",
      code: worklist.code,
      tone: "danger",
    });
  } else if (worklist.entries.length === 0) {
    rows.push({
      key: "worklist:empty",
      type: "worklistMessage",
      messageKey: "handoff.worklist.empty",
      code: null,
      tone: "muted",
    });
  } else {
    worklist.entries.forEach((entry, index) => {
      rows.push({
        key: `worklistEntry:${entry.externalId}:${index}`,
        type: "worklistEntry",
        display: entry.display,
        externalId: entry.externalId,
        techName: resolveStaffName(handover.staff, entry.byTechId),
      });
    });
  }

  return rows;
}
