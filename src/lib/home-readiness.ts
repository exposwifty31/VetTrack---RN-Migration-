/**
 * G2.5 Aurora home — pure client-side derivations over the equipment list
 * (README.md §State Management). Everything here is computed from fields the
 * list endpoint really returns — nothing is fabricated. Missing/unknown fields
 * degrade to the honest bucket (never to a "problem" or a "ready" claim that
 * the data cannot support beyond the documented coverage semantics below).
 */
import type { EquipmentRow } from "@/types/api";

export type Readiness = {
  total: number;
  ready: number;
  notReady: number;
  checkedOut: number;
  inUse: number;
  /** Available-coverage % (ready/total, rounded). null when the fleet is empty. */
  coveragePct: number | null;
};

export type AttentionSeverity = "overdue" | "maintenance";

export type AttentionItem = {
  id: string;
  equipmentName: string;
  severity: AttentionSeverity;
  holder?: string;
  /** Epoch ms of the expected return — only when genuinely derivable. */
  dueAtMs?: number;
};

export type ExceptionItem = {
  id: string;
  name: string;
};

/**
 * The ONE stale threshold — shared by the home exceptions derivation and the
 * equipment-row stale meta tier (owner decision 2026-08-07: same field
 * `lastSeen`, same 14 days, single constant).
 */
export const EXCEPTION_STALE_DAYS = 14;
export const DAY_MS = 86_400_000;

/** usageState values that mean "the unit is being used right now" (server enum). */
const IN_USE_STATES = new Set(["in_use", "staged", "emergency_use"]);

/**
 * Buckets are mutually exclusive, priority checkedOut > inUse > notReady >
 * ready, so each unit is counted exactly once and columns sum to total.
 * "Ready" = not checked out, not in use, and not explicitly `not_ready` —
 * this is the design's "כיסוי זמין" (available coverage) semantic; a row with
 * `readinessState: "unknown"` counts as covered because nothing marks it down.
 */
export function deriveReadiness(items: readonly EquipmentRow[]): Readiness {
  let checkedOut = 0;
  let inUse = 0;
  let notReady = 0;
  for (const item of items) {
    if (item.custodyState === "checked_out") {
      checkedOut += 1;
    } else if (item.usageState != null && IN_USE_STATES.has(item.usageState)) {
      inUse += 1;
    } else if (item.readinessState === "not_ready") {
      notReady += 1;
    }
  }
  const total = items.length;
  const ready = total - checkedOut - inUse - notReady;
  return {
    total,
    ready,
    notReady,
    checkedOut,
    inUse,
    coveragePct: total === 0 ? null : Math.round((ready / total) * 100),
  };
}

/**
 * Attention items — overdue returns + maintenance flags. Overdue is real only
 * when the row carries a checkout time AND an expected-return window (or the
 * server already stamped `status: "overdue"`). An empty result renders the
 * "all clear" state — the good-news empty, never a placeholder.
 */
export function deriveAttentionItems(
  items: readonly EquipmentRow[],
  nowMs: number,
): AttentionItem[] {
  const overdue: AttentionItem[] = [];
  const maintenance: AttentionItem[] = [];
  for (const item of items) {
    let dueAtMs: number | undefined;
    let isOverdue = item.status === "overdue";
    if (
      item.custodyState === "checked_out" &&
      item.checkedOutAt != null &&
      item.expectedReturnMinutes != null &&
      // Server data — reject negative/non-finite windows instead of deriving
      // a bogus due timestamp or a false "overdue".
      Number.isFinite(item.expectedReturnMinutes) &&
      item.expectedReturnMinutes >= 0
    ) {
      const checkedOutMs = Date.parse(item.checkedOutAt);
      if (Number.isFinite(checkedOutMs)) {
        dueAtMs = checkedOutMs + item.expectedReturnMinutes * 60_000;
        if (nowMs > dueAtMs) isOverdue = true;
      }
    }
    if (isOverdue) {
      overdue.push({
        id: item.id,
        equipmentName: item.name,
        severity: "overdue",
        holder: item.checkedOutByEmail ?? undefined,
        dueAtMs,
      });
    } else if (item.status === "maintenance") {
      // G2.5 data seam: a maintenance DUE DATE (lastMaintenanceDate +
      // maintenanceIntervalDays) is not modelled on the RN row yet — the row
      // renders without a date until those fields are threaded through.
      maintenance.push({ id: item.id, equipmentName: item.name, severity: "maintenance" });
    }
  }
  return [...overdue, ...maintenance];
}

/**
 * Exceptions — units with no scan in >14 days, derived from `lastSeen`.
 * G2.5 data seam: rows with `lastSeen: null` (never scanned) are NOT counted —
 * without a creation/enrollment timestamp on the RN row we cannot honestly
 * claim "no scan in more than 14 days" for them.
 */
export function deriveExceptions(
  items: readonly EquipmentRow[],
  nowMs: number,
): ExceptionItem[] {
  const staleBefore = nowMs - EXCEPTION_STALE_DAYS * DAY_MS;
  const out: ExceptionItem[] = [];
  for (const item of items) {
    if (item.lastSeen == null) continue;
    const seenMs = Date.parse(item.lastSeen);
    if (Number.isFinite(seenMs) && seenMs < staleBefore) {
      out.push({ id: item.id, name: item.name });
    }
  }
  return out;
}
