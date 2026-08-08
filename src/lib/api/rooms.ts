/**
 * Rooms API module (G3 Slice 7) — per-domain module per G3-PLAN §2 rule 3:
 * canonical key factory + typed fns, tasks.ts idioms, coded-error plumbing.
 *
 * Server truth (verified 2026-08-08 against the vettrack repo, read-only —
 * server/routes/rooms.ts):
 *   - GET /api/rooms                 requireAuth. Raw ARRAY of rooms, each with
 *     equipment counts + expectedFill/atHomeCount + lastSweptAt/lastSweptByName.
 *   - GET /api/rooms/:id             requireAuth. Single room + counts +
 *     linkedPatientName + lastSweptAt/lastSweptByName. 404 ROOM_NOT_FOUND.
 *   - GET /api/rooms/:id/activity    requireAuth. Raw ARRAY, last 5 scan_log
 *     entries for equipment CURRENTLY in the room. `userName` is present ONLY
 *     for admins (server strips it otherwise).
 * All three are read-only + `requireAuth` (no role floor) — an off-shift
 * student can read rooms, so no off-shift empty-state is needed for reads.
 *
 * Freshness rides `audit_log` SSE rows (rooms/docking emit no dedicated domain
 * events — Scout 3) plus the `EQUIPMENT_` broadcast prefix (a custody/dock move
 * changes a room's counts + membership). See ROOM_AUDIT_ACTION_TYPES below.
 */
import { requestJson } from "@/lib/api/coded-error";

/** Canonical rooms query-key factory — everything nests under `all`. */
export const roomKeys = {
  all: ["rooms"] as const,
  list: () => ["rooms", "list"] as const,
  detail: (id: string) => ["rooms", "detail", id] as const,
  activity: (id: string) => ["rooms", "activity", id] as const,
};

/**
 * Audit actionTypes that mean "a room's contents, sweep state, or membership
 * changed". Verified against the closed AuditActionType union in
 * server/lib/audit.ts + the writers in server/routes/{rooms,docking}.ts and
 * server/routes/equipment/handlers/post-equipment-bulk-verify-room.ts:
 *   - room_created / room_updated / room_deleted   room CRUD
 *   - room_bulk_verified                           bulk verify-room
 *   - room_swept                                   sweep commit
 *   - equipment_anchor_created / _contradicted     sweep/citizen/not-found-here
 *   - equipment_home_assigned                      re-homing changes expectedFill
 * Rooms/docking emit no dedicated outbox domain events; these `audit_log` rows
 * are the guaranteed SSE invalidation channel.
 */
export const ROOM_AUDIT_ACTION_TYPES = [
  "room_created",
  "room_updated",
  "room_deleted",
  "room_bulk_verified",
  "room_swept",
  "equipment_anchor_created",
  "equipment_anchor_contradicted",
  "equipment_home_assigned",
] as const;

/**
 * The equipment broadcast prefix — a custody/dock/RFID move re-buckets a room's
 * counts (in-use / available / atHome). One prefix covers the equipment domain
 * (mirrors useEquipmentRealtimeSync).
 */
export const ROOM_EVENT_TYPE_PREFIXES = ["EQUIPMENT_"] as const;

/** Room list item (GET /api/rooms) — the room row + computed readiness fields. */
export type Room = Readonly<{
  id: string;
  name: string;
  floor: string | null;
  syncStatus: string;
  totalEquipment: number;
  availableCount: number;
  inUseCount: number;
  issueCount: number;
  recentlyVerifiedCount: number;
  /** Homed-based expected fill (items homed here with a category). */
  expectedFill: number;
  /** Items reconciled "at home" right now. */
  atHomeCount: number;
  lastSweptAt: string | null;
  lastSweptByName: string | null;
}>;

/**
 * Single room (GET /api/rooms/:id). Counts are CURRENT-room-based
 * (`roomId`), whereas the sweep worklist is HOMED-based (`homeRoomId`) — the
 * two legitimately differ for an item homed here but currently elsewhere.
 */
export type RoomDetail = Readonly<{
  id: string;
  name: string;
  floor: string | null;
  syncStatus: string;
  totalEquipment: number;
  availableCount: number;
  inUseCount: number;
  issueCount: number;
  recentlyVerifiedCount: number;
  linkedPatientName: string | null;
  lastSweptAt: string | null;
  lastSweptByName: string | null;
}>;

/** One room-activity entry (GET /api/rooms/:id/activity) — a scan_log row. */
export type RoomActivityEntry = Readonly<{
  id: string;
  userId: string | null;
  userEmail: string | null;
  /** Admin-only — the server omits this field for non-admin callers. */
  userName?: string | null;
  equipmentId: string;
  equipmentName: string;
  status: string | null;
  note: string | null;
  timestamp: string;
}>;

export const roomsApi = {
  /** GET /api/rooms — every room with counts + last-swept meta. */
  list: async (): Promise<Room[]> => requestJson<Room[]>("/api/rooms"),

  /** GET /api/rooms/:id — one room (path id encoded, CWE-29 idiom). */
  byId: async (roomId: string): Promise<RoomDetail> =>
    requestJson<RoomDetail>(`/api/rooms/${encodeURIComponent(roomId)}`),

  /** GET /api/rooms/:id/activity — last 5 scan-log entries in the room. */
  activity: async (roomId: string): Promise<RoomActivityEntry[]> =>
    requestJson<RoomActivityEntry[]>(`/api/rooms/${encodeURIComponent(roomId)}/activity`),
};
