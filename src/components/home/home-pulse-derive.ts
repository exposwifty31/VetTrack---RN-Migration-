/**
 * Pure derivations for the home daily pulse (G3 Slice 5) — its own module (the
 * tasks-derive / equipment-row-status pattern) so tests import it without the
 * component tree or Reanimated.
 */
import { ACTIVITY_AUDIT_ACTION_TYPES, homeKeys, type ActivityItem, type ActivityPage, type HomeDashboard } from "@/lib/api/home";
import { nudgeKeys } from "@/lib/api/nudges";
import {
  SHIFT_ADJUSTMENT_AUDIT_ACTION_TYPES,
  shiftAdjustmentKeys,
} from "@/lib/api/shift-adjustments";
import { TASK_AUDIT_ACTION_TYPES, TASK_EVENT_TYPE_PREFIXES, taskKeys } from "@/lib/api/tasks";

/**
 * The ONE realtime invalidation spec for the home pulse — scans/transfers +
 * task lifecycle + shift adjustments ride audit_log rows (verified vocab in
 * the api modules); TASK_ broadcasts stay the best-effort additive channel.
 * KEEPALIVE never invalidates (enforced inside useRealtimeInvalidation).
 * Equipment-list freshness is NOT this spec's job — the untouched
 * `useEquipmentRealtimeSync` mount owns the `['equipment']` key.
 */
export function homePulseInvalidationSpec() {
  return {
    typePrefixes: TASK_EVENT_TYPE_PREFIXES,
    auditActionTypes: [
      ...ACTIVITY_AUDIT_ACTION_TYPES,
      ...TASK_AUDIT_ACTION_TYPES,
      ...SHIFT_ADJUSTMENT_AUDIT_ACTION_TYPES,
    ],
    queryKeys: [homeKeys.all, taskKeys.all, shiftAdjustmentKeys.all, nudgeKeys.all],
  } as const;
}

/**
 * Flatten useInfiniteQuery pages into one feed, deduped by id in arrival
 * order. Dedupe is a guard, not decoration: the server's strict `lt(cursor)`
 * pagination cannot duplicate rows, but an SSE invalidation refetching page 1
 * while older pages remain cached can transiently re-serve a row.
 */
export function flattenActivityPages(
  pages: readonly ActivityPage[] | undefined,
): ActivityItem[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

export type ShiftHeroState =
  | { kind: "loading" }
  | { kind: "onShift"; endsAt: string; role: string }
  | { kind: "offShift"; nextStartsAt: string | null };

/**
 * Hero headline state from the dashboard payload. The server already resolved
 * roster membership — no client-side window math here (single authority).
 */
export function deriveShiftHeroState(dashboard: HomeDashboard | undefined): ShiftHeroState {
  if (!dashboard) return { kind: "loading" };
  if (dashboard.shift) {
    return { kind: "onShift", endsAt: dashboard.shift.endsAt, role: dashboard.shift.role };
  }
  return { kind: "offShift", nextStartsAt: dashboard.nextShift?.startsAt ?? null };
}

/**
 * Local clock time (HH:MM) of an ISO instant — feeds the adjustment picker's
 * initial value and the direction mirror. Device-local rendering of the
 * server-local shift frame is the same on-site-staff assumption the Tasks day
 * param makes (`isoDayString`). Unparseable input → null (render nothing).
 */
export function clockTimeFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Literal key union so the strictly-typed `t` accepts the mapped result. */
export type AdjustmentErrorKey =
  | "shiftAdjustments.errors.notOnShift"
  | "shiftAdjustments.errors.duplicatePending"
  | "shiftAdjustments.errors.notAnExtension"
  | "shiftAdjustments.errors.notEarlier"
  | "shiftAdjustments.errors.invalidTime"
  | "shiftAdjustments.errors.invalidReason"
  | "common.errorGeneric";

/**
 * Coded server rejection (apiError `reason`, falling back to `code`) → i18n
 * copy key for the adjustment sheet — the tasks `lifecycleErrorKey` idiom.
 * Also consumed for the client-side direction mirror's inline warning.
 */
export function adjustmentErrorKey(reason: string | null): AdjustmentErrorKey {
  switch (reason) {
    case "NOT_ON_SHIFT":
      return "shiftAdjustments.errors.notOnShift";
    case "DUPLICATE_PENDING":
      return "shiftAdjustments.errors.duplicatePending";
    case "NOT_AN_EXTENSION":
      return "shiftAdjustments.errors.notAnExtension";
    case "NOT_EARLIER":
      return "shiftAdjustments.errors.notEarlier";
    case "INVALID_TIME":
      return "shiftAdjustments.errors.invalidTime";
    case "INVALID_REASON":
      return "shiftAdjustments.errors.invalidReason";
    default:
      return "common.errorGeneric";
  }
}

const MINUTES_PER_DAY = 1440;

/**
 * Shift a HH:MM clock time by `deltaMinutes`, wrapping across midnight — the
 * adjustment picker's stepper math. Malformed OR out-of-range input (hours
 * >23, minutes >59 — e.g. "12:99") returns unchanged so a stepper press can
 * never corrupt the field, and never silently normalizes an invalid time.
 */
export function shiftClockTime(time: string, deltaMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return time;
  const total = hours * 60 + minutes;
  const next = (((total + deltaMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(next / 60)).padStart(2, "0");
  const m = String(next % 60).padStart(2, "0");
  return `${h}:${m}`;
}
