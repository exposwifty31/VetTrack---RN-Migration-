/**
 * Alert-acks API module (G3 Slice 6) — reuses the shared coded-error plumbing
 * (`src/lib/api/coded-error.ts`), same idiom as `nudges.ts`.
 *
 * Server truth (verified 2026-08-08 against `server/routes/alert-acks.ts`,
 * read-only):
 *   - GET   /api/alert-acks?includeResolved=true  requireAuth (student+) —
 *     returns a BARE array of ack rows (SEEN + RESOLVED). Reads are universal.
 *   - POST  /api/alert-acks {equipmentId, alertType}  requireEffectiveRole(
 *     "senior_technician") — idempotent upsert ("who's handling this"); a
 *     RESOLVED row flips back to SEEN. Returns the bare row (201 new / 200
 *     existing).
 *   - PATCH /api/alert-acks/:id/resolve {resolutionNote?}  senior_technician+ —
 *     marks RESOLVED (intent-only, may re-escalate); idempotent. Returns the
 *     bare row.
 *   - DELETE is intentionally NOT wired: no server route exists (G3-PLAN seam
 *     §6.1 — the web client's dead call). Do not add it.
 *
 * Off-shift senior users resolve below the floor → 403 INSUFFICIENT_ROLE; the
 * screen pre-gates on `hasRoleAtLeast` AND maps a server 403 to an inline note.
 */
import * as Crypto from "expo-crypto";

import { requestJson } from "@/lib/api/coded-error";

/** Canonical alert-acks query-key factory — everything nests under `all`. */
export const alertAckKeys = {
  all: ["alert-acks"] as const,
  list: () => ["alert-acks", "list"] as const,
};

/**
 * audit_log actionTypes that mean an ack changed — verified against the closed
 * `AuditActionType` union in `server/lib/audit.ts` (`alert_seen` on POST,
 * `alert_resolved` on PATCH resolve). Acks emit no dedicated domain events;
 * these `audit_log` rows are the guaranteed SSE invalidation channel.
 */
export const ALERT_ACK_AUDIT_ACTION_TYPES = ["alert_seen", "alert_resolved"] as const;

export type AlertAckStatus = "SEEN" | "RESOLVED";

/**
 * One ack row (server ACK_COLUMNS). Optional beyond the identity/status fields
 * so an older server shape degrades to honest empty renders instead of crashing.
 */
export type AlertAck = Readonly<{
  id: string;
  equipmentId: string;
  alertType: string;
  ackStatus: AlertAckStatus;
  acknowledgedById?: string | null;
  acknowledgedByEmail?: string | null;
  acknowledgedByDisplayName?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  resolutionNote?: string | null;
}>;

/** Per-attempt request id for server-side tracing (the established scan idiom). */
function requestIdHeaders(): Record<string, string> {
  return { "x-request-id": Crypto.randomUUID() };
}

export const alertAcksApi = {
  /** GET /api/alert-acks?includeResolved=true — SEEN + RESOLVED rows (bare array). */
  list: (): Promise<AlertAck[]> =>
    requestJson<AlertAck[]>("/api/alert-acks?includeResolved=true"),

  /** POST /api/alert-acks — take ownership (idempotent upsert). senior_technician+. */
  acknowledge: (equipmentId: string, alertType: string): Promise<AlertAck> =>
    requestJson<AlertAck>("/api/alert-acks", {
      method: "POST",
      body: JSON.stringify({ equipmentId, alertType }),
      headers: requestIdHeaders(),
    }),

  /** PATCH /api/alert-acks/:id/resolve — mark RESOLVED (intent-only). senior_technician+. */
  resolve: (ackId: string, resolutionNote?: string): Promise<AlertAck> =>
    requestJson<AlertAck>(`/api/alert-acks/${encodeURIComponent(ackId)}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(resolutionNote ? { resolutionNote } : {}),
      headers: requestIdHeaders(),
    }),
};
