/**
 * Alerts derivation — the client-side alert model ported from the web
 * `computeAlerts` (vettrack `src/lib/utils.ts`) + `use-alerts-controller` join
 * semantics.
 *
 * Alerts are DERIVED from equipment status, one per item, worst-first with a
 * fixed precedence: issue > overdue > sterilization_due > inactive. They are
 * joined with acknowledgement rows under the server's two-level model
 * (`server/routes/alert-acks.ts`): SEEN keeps alerting (a "handling" overlay),
 * RESOLVED stops the reminder but — because resolution is intent-only, not
 * truth, and may re-escalate — the derived alert stays VISIBLE while the
 * condition persists, offering a re-acknowledge (which flips RESOLVED→SEEN
 * server-side). Rows are never deleted. The web fetches SEEN-only acks and so
 * never suppresses a derived alert; this port keeps that behaviour and uses the
 * extra RESOLVED rows (from `?includeResolved=true`) only to label state.
 *
 * Pure + framework-free (the `equipment-row-status` precedent): no i18n, no
 * Reanimated, no `Date.now()` — `nowMs` is threaded so fixtures stay
 * deterministic (avoids dragging RN/Reanimated into jest).
 */
import type { ChipTone } from "@/components/ui/chip-tone";
import { hasRoleAtLeast } from "@/lib/roles";

/** Web parity: `shared/constants.ts` INACTIVE_THRESHOLD_DAYS. */
export const INACTIVE_THRESHOLD_DAYS = 14;
/** Web parity: `isSterilizationDue` uses a 7-day window. */
const STERILIZATION_DUE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The types `computeAlerts` may emit (web ALERT_TYPE_ALLOWLIST). */
export type AlertType = "issue" | "overdue" | "sterilization_due" | "inactive";
export type AlertSeverity = "critical" | "high" | "medium" | "low";

/** Web parity: ALERT_SEVERITY (`src/types/equipment.ts`). */
export const ALERT_SEVERITY: Record<AlertType, AlertSeverity> = {
  issue: "critical",
  overdue: "high",
  sterilization_due: "medium",
  inactive: "low",
};

/**
 * Structural view of an equipment row the derivation reads. Every maintenance
 * field is optional so the minimal `EquipmentRow` (`types/api.ts`, the hero-flow
 * shape) is assignable WITHOUT widening that shared type — the server list
 * endpoint (`get-equipment-list.ts`) projects `lastMaintenanceDate` /
 * `lastSterilizationDate` / `maintenanceIntervalDays` / `lastSeen` at runtime
 * even though the RN type omits them.
 */
export type AlertEquipmentInput = Readonly<{
  id: string;
  name: string;
  status: string;
  lastSeen?: string | null;
  lastMaintenanceDate?: string | null;
  lastSterilizationDate?: string | null;
  maintenanceIntervalDays?: number | null;
}>;

/** Ack-row fields the join reads — a structural subset of `AlertAck`. */
export type AlertAckInput = Readonly<{
  id: string;
  equipmentId: string;
  alertType: string;
  /** "SEEN" | "RESOLVED". */
  ackStatus: string;
  acknowledgedByDisplayName?: string | null;
  acknowledgedByEmail?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
}>;

export type DerivedAlert = Readonly<{
  type: AlertType;
  severity: AlertSeverity;
  equipmentId: string;
  equipmentName: string;
  /** Present only for `overdue` — feeds the pluralized detail copy. */
  daysOverdue?: number;
}>;

function parseMs(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isOverdue(eq: AlertEquipmentInput, nowMs: number): boolean {
  if (!eq.maintenanceIntervalDays) return false;
  const last = parseMs(eq.lastMaintenanceDate);
  if (last == null) return false;
  return nowMs > last + eq.maintenanceIntervalDays * DAY_MS;
}

/** Whole days past the maintenance due date (web `Math.ceil`). 0 when not overdue. */
export function daysOverdue(eq: AlertEquipmentInput, nowMs: number): number {
  if (!eq.maintenanceIntervalDays) return 0;
  const last = parseMs(eq.lastMaintenanceDate);
  if (last == null) return 0;
  const due = last + eq.maintenanceIntervalDays * DAY_MS;
  return Math.max(0, Math.ceil((nowMs - due) / DAY_MS));
}

export function isSterilizationDue(eq: AlertEquipmentInput, nowMs: number): boolean {
  const last = parseMs(eq.lastSterilizationDate);
  if (last == null) return false;
  return nowMs - STERILIZATION_DUE_DAYS * DAY_MS > last;
}

/**
 * Web parity: a missing `lastSeen` reads as inactive; a present-but-unparseable
 * value cannot be claimed inactive (matches date-fns `isAfter(cutoff, Invalid)`
 * → false).
 */
export function isInactive(eq: AlertEquipmentInput, nowMs: number): boolean {
  if (eq.lastSeen == null || eq.lastSeen === "") return true;
  const seen = parseMs(eq.lastSeen);
  if (seen == null) return false;
  return nowMs - INACTIVE_THRESHOLD_DAYS * DAY_MS > seen;
}

/**
 * One alert per equipment, worst-first precedence (web `computeAlerts`). Status
 * source is the live `status` column, never a stale `lastStatus`. i18n-free: the
 * detail copy is a screen concern (keyed off `type` + `daysOverdue`).
 */
export function computeAlerts(
  equipment: readonly AlertEquipmentInput[],
  nowMs: number,
): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];
  for (const eq of equipment) {
    if (eq.status === "issue") {
      alerts.push({
        type: "issue",
        severity: ALERT_SEVERITY.issue,
        equipmentId: eq.id,
        equipmentName: eq.name,
      });
    } else if (isOverdue(eq, nowMs)) {
      alerts.push({
        type: "overdue",
        severity: ALERT_SEVERITY.overdue,
        equipmentId: eq.id,
        equipmentName: eq.name,
        daysOverdue: daysOverdue(eq, nowMs),
      });
    } else if (isSterilizationDue(eq, nowMs)) {
      alerts.push({
        type: "sterilization_due",
        severity: ALERT_SEVERITY.sterilization_due,
        equipmentId: eq.id,
        equipmentName: eq.name,
      });
    } else if (isInactive(eq, nowMs)) {
      alerts.push({
        type: "inactive",
        severity: ALERT_SEVERITY.inactive,
        equipmentId: eq.id,
        equipmentName: eq.name,
      });
    }
  }
  return alerts;
}

/** Worst-first ordering (web AlertsProView sort). */
const SORT_ORDER: readonly AlertType[] = ["issue", "overdue", "sterilization_due", "inactive"];
const URGENT_TYPES: ReadonlySet<AlertType> = new Set<AlertType>(["issue", "overdue"]);

export function sortAlerts(alerts: readonly DerivedAlert[]): DerivedAlert[] {
  return [...alerts].sort((a, b) => SORT_ORDER.indexOf(a.type) - SORT_ORDER.indexOf(b.type));
}

/** Urgent = open issues + overdue maintenance (web URGENT_TYPES). */
export function isUrgentType(type: AlertType): boolean {
  return URGENT_TYPES.has(type);
}

/** Severity → semantic chip tone. Danger (issue) is a solid, never-animated fill. */
const TYPE_TONE: Record<AlertType, ChipTone> = {
  issue: "danger",
  overdue: "warning",
  sterilization_due: "warning",
  inactive: "stale",
};

export function alertTone(type: AlertType): ChipTone {
  return TYPE_TONE[type];
}

/** Stable ack lookup key (web `alertAckKey`). */
export function alertAckKey(equipmentId: string, alertType: string): string {
  return `${equipmentId}:${alertType}`;
}

export function buildAckMap(
  acks: readonly AlertAckInput[] | undefined,
): Map<string, AlertAckInput> {
  const map = new Map<string, AlertAckInput>();
  for (const ack of acks ?? []) {
    map.set(alertAckKey(ack.equipmentId, ack.alertType), ack);
  }
  return map;
}

export type AlertRowState = "unclaimed" | "handling" | "resolved";

export type AlertViewRow = Readonly<{
  alert: DerivedAlert;
  ack: AlertAckInput | null;
  state: AlertRowState;
}>;

export type AlertSectionKey = "urgent" | "maintenance";

export type AlertSection = Readonly<{
  key: AlertSectionKey;
  rows: AlertViewRow[];
}>;

export type AlertsView = Readonly<{
  sections: AlertSection[];
  /** Every currently-derived alert (nothing is suppressed — web parity). */
  total: number;
  urgentCount: number;
}>;

function rowState(ack: AlertAckInput | null): AlertRowState {
  if (!ack) return "unclaimed";
  return ack.ackStatus === "RESOLVED" ? "resolved" : "handling";
}

/**
 * The screen's whole data model: worst-first alerts split into urgent /
 * maintenance sections, each row carrying its ack + derived state. Empty
 * sections are dropped so the list renders only headers with rows.
 */
export function deriveAlertsView(
  equipment: readonly AlertEquipmentInput[],
  acks: readonly AlertAckInput[] | undefined,
  nowMs: number,
): AlertsView {
  const sorted = sortAlerts(computeAlerts(equipment, nowMs));
  const ackMap = buildAckMap(acks);

  const urgent: AlertViewRow[] = [];
  const maintenance: AlertViewRow[] = [];

  for (const alert of sorted) {
    const ack = ackMap.get(alertAckKey(alert.equipmentId, alert.type)) ?? null;
    const row: AlertViewRow = { alert, ack, state: rowState(ack) };
    if (isUrgentType(alert.type)) urgent.push(row);
    else maintenance.push(row);
  }

  const sections: AlertSection[] = [];
  if (urgent.length > 0) sections.push({ key: "urgent", rows: urgent });
  if (maintenance.length > 0) sections.push({ key: "maintenance", rows: maintenance });

  return { sections, total: sorted.length, urgentCount: urgent.length };
}

/**
 * Acknowledge/resolve are `requireEffectiveRole("senior_technician")` server-side
 * (`server/routes/alert-acks.ts`). Reads are universal — pre-gate the affordance
 * on the SAME field the server enforces (`effectiveRole`).
 */
export function canManageAlerts(role: string | undefined | null): boolean {
  return hasRoleAtLeast(role, "senior_technician");
}
