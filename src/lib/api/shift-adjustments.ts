/**
 * Shift-adjustments API module (G3 Slice 5) — per-domain module per G3-PLAN §2
 * rule 3.
 *
 * Server truth (verified 2026-08-07 against server/routes/shift-adjustments.ts
 * + server/lib/shift-adjustment-window.ts, read-only):
 *   - POST /api/shift-adjustments `{kind, requestedEndTime, reason}` —
 *     `kind` (NOT `type`) ∈ {"extend","leave_early"} else 400 INVALID_KIND;
 *     `requestedEndTime` is REQUIRED clock time (H:MM / HH:MM / HH:MM:SS per
 *     the server TIME_RE) else 400 INVALID_TIME; `reason` trimmed 3–500 chars
 *     else 400 INVALID_REASON. Then: 409 NOT_ON_SHIFT (roster-derived), 400
 *     NOT_AN_EXTENSION / NOT_EARLIER (direction), 409 DUPLICATE_PENDING (one
 *     open request per person per rostered day). 201 returns the created row.
 *   - GET /api/shift-adjustments?status= → `{requests}` — a non-admin caller
 *     sees only their own rows.
 *   - POST /api/shift-adjustments/:id/cancel — requester-only (403 NOT_OWNER),
 *     pending-only (409 ALREADY_DECIDED).
 *
 * The client-side mirror below reproduces the server's validation ORDER and
 * regex so the sheet can pre-empt every 400 with translated copy; the server
 * remains the authority (mirror drift surfaces as a coded error, not a crash).
 */
import * as Crypto from "expo-crypto";

import { requestJson } from "@/lib/api/coded-error";

/** Canonical shift-adjustments query-key factory — everything nests under `all`. */
export const shiftAdjustmentKeys = {
  all: ["shiftAdjustments"] as const,
  list: (status?: ShiftAdjustmentStatus) =>
    status
      ? (["shiftAdjustments", "list", status] as const)
      : (["shiftAdjustments", "list"] as const),
};

/**
 * Audit actionTypes for shift-adjustment state changes — verified against the
 * four logAudit calls in server/routes/shift-adjustments.ts and the closed
 * AuditActionType union in server/lib/audit.ts. No dedicated domain events
 * exist; these audit_log rows are the SSE invalidation channel.
 */
export const SHIFT_ADJUSTMENT_AUDIT_ACTION_TYPES = [
  "shift_adjustment_requested",
  "shift_adjustment_approved",
  "shift_adjustment_rejected",
  "shift_adjustment_cancelled",
] as const;

export type ShiftAdjustmentKind = "extend" | "leave_early";
export type ShiftAdjustmentStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ShiftAdjustment = Readonly<{
  id: string;
  kind: ShiftAdjustmentKind;
  requesterUserId: string;
  requesterName: string | null;
  /** YYYY-MM-DD of the rostered shift the request adjusts. */
  baseShiftDate: string;
  /** HH:MM:SS clock time of the shift's current (unadjusted) end. */
  currentEndTime: string;
  /** HH:MM:SS clock time requested as the new effective end. */
  requestedEndTime: string;
  reason: string;
  status: ShiftAdjustmentStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}>;

export type ShiftAdjustmentInput = Readonly<{
  kind: ShiftAdjustmentKind;
  /** HH:MM — REQUIRED by the server (INVALID_TIME otherwise). */
  requestedEndTime: string;
  reason: string;
}>;

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

/** Mirror of the server's TIME_RE (H:MM / HH:MM / HH:MM:SS, 24h). */
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function isValidAdjustmentTime(value: string): boolean {
  return TIME_RE.test(value.trim());
}

const MINUTES_PER_DAY = 1440;

function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Overnight-aware end minutes: an end at/before the start rolls to the next day. */
function endAbsMinutes(startMins: number, endMins: number): number {
  return endMins <= startMins ? endMins + MINUTES_PER_DAY : endMins;
}

export type AdjustmentValidationFailure =
  | "INVALID_KIND"
  | "INVALID_TIME"
  | "INVALID_REASON"
  | "NOT_AN_EXTENSION"
  | "NOT_EARLIER";

export type AdjustmentValidation =
  | { ok: true }
  | { ok: false; reason: AdjustmentValidationFailure };

/**
 * Client-side mirror of the server's create validation, in the server's ORDER
 * (kind → time → reason → direction). `shiftWindow` (the active shift's clock
 * times) enables the overnight-aware direction check; omit it to validate the
 * field shapes only.
 */
export function validateAdjustmentRequest(
  input: { kind: string; requestedEndTime: string; reason: string },
  shiftWindow?: { startTime: string; endTime: string },
): AdjustmentValidation {
  if (input.kind !== "extend" && input.kind !== "leave_early") {
    return { ok: false, reason: "INVALID_KIND" };
  }
  if (!isValidAdjustmentTime(input.requestedEndTime)) {
    return { ok: false, reason: "INVALID_TIME" };
  }
  const reason = input.reason.trim();
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH) {
    return { ok: false, reason: "INVALID_REASON" };
  }
  if (shiftWindow) {
    const startMins = timeToMinutes(shiftWindow.startTime);
    const currentEndAbs = endAbsMinutes(startMins, timeToMinutes(shiftWindow.endTime));
    const requestedEndAbs = endAbsMinutes(startMins, timeToMinutes(input.requestedEndTime));
    if (input.kind === "extend" && requestedEndAbs <= currentEndAbs) {
      return { ok: false, reason: "NOT_AN_EXTENSION" };
    }
    if (input.kind === "leave_early" && requestedEndAbs >= currentEndAbs) {
      return { ok: false, reason: "NOT_EARLIER" };
    }
  }
  return { ok: true };
}

export const shiftAdjustmentsApi = {
  /** POST /api/shift-adjustments — request an extend / leave-early. */
  create: async (input: ShiftAdjustmentInput): Promise<ShiftAdjustment> =>
    requestJson<ShiftAdjustment>("/api/shift-adjustments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": Crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    }),

  /** GET /api/shift-adjustments[?status=] — the caller's own rows (non-admin). */
  list: async (status?: ShiftAdjustmentStatus): Promise<ShiftAdjustment[]> => {
    const path = status
      ? `/api/shift-adjustments?status=${encodeURIComponent(status)}`
      : "/api/shift-adjustments";
    const body = await requestJson<{ requests: ShiftAdjustment[] }>(path);
    return body.requests;
  },

  /** POST /api/shift-adjustments/:id/cancel — cancel own pending request. */
  cancel: async (id: string): Promise<ShiftAdjustment> =>
    requestJson<ShiftAdjustment>(`/api/shift-adjustments/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { "x-request-id": Crypto.randomUUID() },
    }),
};
