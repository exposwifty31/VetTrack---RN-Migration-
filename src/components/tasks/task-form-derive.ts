/**
 * Pure derivations for the create/edit task form (Slice 3b) — colocated with
 * the sheet, zero RN / zero i18n imports (the `equipment-row-status` pattern),
 * so the time math, RBAC gates, and coded-error mapping unit-test without the
 * component tree OR the `@/i18n` → safe-storage native chain.
 *
 * Server truths mirrored here (verified 2026-08-07 against vettrack
 * server/services/appointments.service.ts + routes/appointments.ts, read-only):
 *   - `toUtcDate` rejects offset-less time strings → the window builder emits
 *     `Date#toISOString()` (always `…Z`, timezone-qualified).
 *   - `ensureTimeWindow` requires end > start → a positive duration guarantees it.
 *   - create/edit gate on `task.create` RBAC (NOT a `task.update`); assigning
 *     an assignee additionally needs `task.assign`.
 */
import { canPerformTaskAction } from "@/lib/task-permissions";
import type { TaskMeta } from "@/types/tasks";

const MINUTES_PER_DAY = 1440;
const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

/** Duration bounds for the stepper (server only needs end > start). */
export const DURATION_STEP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 12 * 60;
export const DEFAULT_DURATION_MINUTES = 60;

/**
 * Shift an HH:MM clock string by `deltaMinutes`, wrapping across midnight.
 * Malformed OR out-of-range input ("12:99") returns unchanged so a stepper
 * press can never corrupt the field (the `shiftClockTime` contract, kept
 * tasks-local to avoid a tasks→home import).
 */
export function addClockMinutes(time: string, deltaMinutes: number): string {
  const match = CLOCK_RE.exec(time.trim());
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

/** Clamp a duration to the stepper bounds (keeps a press from leaving the range). */
export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_DURATION_MINUTES;
  if (minutes < MIN_DURATION_MINUTES) return MIN_DURATION_MINUTES;
  if (minutes > MAX_DURATION_MINUTES) return MAX_DURATION_MINUTES;
  return minutes;
}

function parseIsoDay(day: string): { year: number; monthIndex: number; dayOfMonth: number } | null {
  const match = ISO_DAY_RE.exec(day);
  if (!match) return null;
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1, dayOfMonth: Number(match[3]) };
}

function parseClock(time: string): { hours: number; minutes: number } | null {
  const match = CLOCK_RE.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Build the timezone-qualified ISO window the server expects from the selected
 * calendar day + a local start clock + a positive duration. Anchors at the
 * DEVICE-local day/time (the same assumption the day-list `?day=` param makes);
 * `toISOString()` yields a `…Z` string, satisfying the server's offset check.
 * Returns null on malformed/invalid day, clock, or non-positive duration —
 * callers keep Save disabled rather than posting a body the server 400s.
 */
export function buildTaskWindow(
  day: string,
  startClock: string,
  durationMinutes: number,
): { startTime: string; endTime: string } | null {
  const parsedDay = parseIsoDay(day);
  const parsedClock = parseClock(startClock);
  if (!parsedDay || !parsedClock) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const start = new Date(
    parsedDay.year,
    parsedDay.monthIndex,
    parsedDay.dayOfMonth,
    parsedClock.hours,
    parsedClock.minutes,
  );
  // Reject calendar-invalid days (Date silently rolls "2026-02-31" into March).
  if (
    start.getFullYear() !== parsedDay.year ||
    start.getMonth() !== parsedDay.monthIndex ||
    start.getDate() !== parsedDay.dayOfMonth
  ) {
    return null;
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

/** LOCAL HH:MM from an ISO instant — prefills the edit form's start stepper. */
export function clockFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Duration (minutes) between two ISO instants — prefills the edit duration. */
export function durationMinutesBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60_000);
}

/** Split a duration in minutes into whole hours + remainder minutes (label math). */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  const clamped = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(clamped / 60), minutes: clamped % 60 };
}

/** Can this gate-role create/edit a task? The PATCH + POST base gate is task.create. */
export function canEditTasks(gateRole: string | null | undefined): boolean {
  return canPerformTaskAction(gateRole, "task.create");
}

/** Can this gate-role cancel a task? DELETE + status→cancelled gate on task.cancel. */
export function canCancelTasks(gateRole: string | null | undefined): boolean {
  return canPerformTaskAction(gateRole, "task.cancel");
}

/** Can this gate-role assign an assignee? Setting `vetId` needs task.assign. */
export function canAssignTasks(gateRole: string | null | undefined): boolean {
  return canPerformTaskAction(gateRole, "task.assign");
}

export type AssigneeOption = Readonly<{
  id: string;
  label: string;
  role: string;
  /** True when the staffer has a roster shift on the selected day. */
  onShift: boolean;
}>;

function staffLabel(name: string | null, displayName: string | null, id: string): string {
  return displayName?.trim() || name?.trim() || id;
}

/**
 * Flatten `meta` into a single deduped assignee list — vets then technicians,
 * on-shift first, then label-ordered. A user present in both role queries
 * (vet with a technician secondary role) collapses to one row, on-shift if
 * either source says so.
 */
export function assigneeOptions(meta: TaskMeta | undefined): AssigneeOption[] {
  if (!meta) return [];
  const byId = new Map<string, AssigneeOption>();
  for (const staff of [...meta.vets, ...meta.technicians]) {
    const onShift = staff.shifts.length > 0;
    const existing = byId.get(staff.id);
    if (existing) {
      if (onShift && !existing.onShift) byId.set(staff.id, { ...existing, onShift: true });
      continue;
    }
    byId.set(staff.id, {
      id: staff.id,
      label: staffLabel(staff.name, staff.displayName, staff.id),
      role: staff.role,
      onShift,
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.onShift !== b.onShift) return a.onShift ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/** Literal union so the strictly-typed `t` accepts the mapped result. */
export type TaskMutationErrorKey =
  | "tasks.errors.invalidForm"
  | "tasks.errors.invalidTime"
  | "tasks.errors.conflict"
  | "tasks.errors.outsideShift"
  | "tasks.errors.assigneeInvalid"
  | "tasks.errors.invalidTransition"
  | "tasks.errors.notFound"
  | "tasks.errors.alreadyApplied"
  | "tasks.errors.offShift"
  | "tasks.errors.notOwned"
  | "common.errorGeneric";

/**
 * Verified server create/edit/cancel error code → translated copy key. Codes
 * come from routes/appointments.ts (VALIDATION_FAILED / INSUFFICIENT_ROLE /
 * IDEMPOTENCY_CONFLICT) and appointments.service.ts (time / conflict / shift /
 * assignee / transition / not-found families); anything unmapped degrades to
 * the generic key rather than leaking a raw code.
 */
export function mutationErrorKey(code: string): TaskMutationErrorKey {
  switch (code) {
    case "INVALID_TIME":
    case "TIMEZONE_REQUIRED":
    case "INVALID_TIME_WINDOW":
      return "tasks.errors.invalidTime";
    case "APPOINTMENT_CONFLICT":
      return "tasks.errors.conflict";
    case "OUTSIDE_SHIFT":
      return "tasks.errors.outsideShift";
    case "VET_NOT_IN_CLINIC":
      return "tasks.errors.assigneeInvalid";
    case "INVALID_STATUS_TRANSITION":
      return "tasks.errors.invalidTransition";
    case "APPOINTMENT_NOT_FOUND":
      return "tasks.errors.notFound";
    case "IDEMPOTENCY_CONFLICT":
      return "tasks.errors.alreadyApplied";
    case "INSUFFICIENT_ROLE":
      return "tasks.errors.offShift";
    case "TASK_NOT_OWNED_BY_TECH":
      return "tasks.errors.notOwned";
    case "VALIDATION_FAILED":
    case "UNASSIGNED_TASK_STATUS":
    case "INVALID_PRIORITY":
    case "INVALID_TASK_TYPE":
    case "INVALID_STATUS":
    case "OVERRIDE_REASON_REQUIRED":
      return "tasks.errors.invalidForm";
    default:
      return "common.errorGeneric";
  }
}
