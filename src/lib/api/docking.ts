/**
 * Docking / room-sweep API module (G3 Slice 7) — per-domain module per
 * G3-PLAN §2 rule 3. Groups the room-operational write flows (sweep, bulk
 * verify, per-item not-found-here) so `src/lib/api.ts` (the equipment domain,
 * a single-writer hotspot) stays untouched — even though bulk-verify's HTTP
 * path lives under `/api/equipment/*`, it is a room-sweep action by feature.
 *
 * Server truth (verified 2026-08-08 against the vettrack repo, read-only):
 *   - GET  /api/docking/rooms/:roomId/sweep    requireAuth. `{roomId, items}` —
 *     every item HOMED to the room (resting + checked-out), each classified via
 *     the reconciliation ladder. Checked-out items are D-9 accounted (shown,
 *     never swept/missing). 404 when the room doesn't exist.
 *     (server/routes/docking.ts)
 *   - POST /api/docking/rooms/:roomId/sweep    requireAuth + writeLimiter +
 *     Zod `{confirmedEquipmentIds: string[] (≤1000)}`. Confirmed resting items
 *     get a fresh source:"sweep" anchor; unconfirmed resting items are
 *     contradicted (sweep_missing). A confirmed id that is checked-out/foreign
 *     is silently ignored. Returns `{roomId, confirmedCount, missingCount,
 *     skippedNoStationCount, sweptById, sweptAt}`.
 *   - POST /api/equipment/bulk-verify-room     requireAuth +
 *     requireEffectiveRole("technician") + Zod `{roomId}`. Marks every item in
 *     the room verified. Off-shift/student → 403 {code:"ACCESS_DENIED",
 *     reason:"INSUFFICIENT_ROLE"} (server buildAccessDeniedBody — the reason,
 *     not the code, carries INSUFFICIENT_ROLE). Returns `{affected, skipped,
 *     roomName}`. (server/routes/equipment/handlers/post-equipment-bulk-verify-room.ts)
 *   - POST /api/docking/equipment/:id/not-found-here   requireAuth +
 *     writeLimiter. Invalidates the item's current open anchor (reason
 *     "not_found_here"); idempotent no-op still 200 `{ok:true}`. 404 when the
 *     item doesn't exist.
 *
 * These endpoints are NOT idempotency-scoped (no idempotencyMiddleware), so we
 * send only `x-request-id` for server-side request correlation, not an
 * Idempotency-Key (contrast tasks.ts lifecycle mutations).
 */
import * as Crypto from "expo-crypto";

import { ApiCodedError, requestJson } from "@/lib/api/coded-error";

/** Canonical docking query-key factory — everything nests under `all`. */
export const dockingKeys = {
  all: ["docking"] as const,
  sweep: (roomId: string) => ["docking", "sweep", roomId] as const,
};

/**
 * The reconciliation bucket a swept item resolves to — the server's closed
 * union (server/services/docking.service.ts classifyReconciliationBucket).
 */
export type ReconciliationBucket =
  | "at_home"
  | "checked_out"
  | "returned_unverified"
  | "returned_away"
  | "misplaced_at_station"
  | "missing"
  | "unassigned"
  | "no_station";

/** One expected (homed) item in a room-sweep worklist. */
export type SweepItem = Readonly<{
  id: string;
  name: string;
  assetTypeId: string | null;
  custodyState: string;
  checkedOutById: string | null;
  checkedOutByEmail: string | null;
  checkedOutAt: string | null;
  homeDockId: string | null;
  homeDockName: string | null;
  atStation: boolean;
  bucket: ReconciliationBucket;
}>;

export type SweepWorklist = Readonly<{ roomId: string; items: SweepItem[] }>;

export type SweepCommitResult = Readonly<{
  roomId: string;
  confirmedCount: number;
  missingCount: number;
  /** Confirmed items with no resolvable home dock — neither swept nor missing. */
  skippedNoStationCount: number;
  sweptById: string;
  sweptAt: string;
}>;

export type BulkVerifyResult = Readonly<{
  affected: number;
  skipped: readonly { id: string; name: string }[];
  roomName: string;
}>;

/**
 * The roster-derived off-shift / under-role signal for the technician+
 * bulk-verify action. The server's `requireEffectiveRole` denial is
 * {code:"ACCESS_DENIED", reason:"INSUFFICIENT_ROLE"} — branch on the REASON
 * (the code is the generic ACCESS_DENIED envelope, verified against
 * server/lib/access-denied.ts buildAccessDeniedBody).
 */
export function isInsufficientRoleError(error: unknown): boolean {
  return (
    error instanceof ApiCodedError &&
    error.status === 403 &&
    error.reason === "INSUFFICIENT_ROLE"
  );
}

/** One fresh request id per write attempt (tracing only — not idempotency). */
function writeHeaders(): Record<string, string> {
  return { "x-request-id": Crypto.randomUUID() };
}

export const dockingApi = {
  /** GET /api/docking/rooms/:roomId/sweep — the homed expected list. */
  getSweep: async (roomId: string): Promise<SweepWorklist> =>
    requestJson<SweepWorklist>(
      `/api/docking/rooms/${encodeURIComponent(roomId)}/sweep`,
    ),

  /** POST /api/docking/rooms/:roomId/sweep — commit the confirmed-present ids. */
  commitSweep: async (
    roomId: string,
    confirmedEquipmentIds: string[],
  ): Promise<SweepCommitResult> =>
    requestJson<SweepCommitResult>(
      `/api/docking/rooms/${encodeURIComponent(roomId)}/sweep`,
      {
        method: "POST",
        headers: writeHeaders(),
        body: JSON.stringify({ confirmedEquipmentIds }),
      },
    ),

  /** POST /api/equipment/bulk-verify-room — technician+; verify the whole room. */
  bulkVerifyRoom: async (roomId: string): Promise<BulkVerifyResult> =>
    requestJson<BulkVerifyResult>("/api/equipment/bulk-verify-room", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify({ roomId }),
    }),

  /** POST /api/docking/equipment/:id/not-found-here — report one item missing. */
  notFoundHere: async (equipmentId: string): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(
      `/api/docking/equipment/${encodeURIComponent(equipmentId)}/not-found-here`,
      { method: "POST", headers: writeHeaders() },
    ),
};
