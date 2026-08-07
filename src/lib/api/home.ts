/**
 * Home daily-pulse API module (G3 Slice 5) — per-domain module per G3-PLAN §2
 * rule 3: canonical key factory + typed fns, tasks.ts idioms.
 *
 * Server truth (verified 2026-08-07 against the vettrack repo, read-only):
 *   - GET /api/home/dashboard (server/routes/home-dashboard.ts, requireAuth):
 *     `{shift, nextShift, streak, tasksCompletedToday, scansToday}`. The
 *     active shift window is `{startedAt, endsAt, role}` (buildShiftWindow);
 *     `nextShift` is `{startsAt, endsAt, role}` — the field-name asymmetry
 *     (startedAt vs startsAt) is the server's, mirrored verbatim here.
 *   - GET /api/activity?cursor=<ISO> (server/routes/activity.ts, requireAuth,
 *     PAGE_SIZE 30): `{items, nextCursor}` — a merged scan/transfer feed,
 *     newest first; `nextCursor` = last item's ISO timestamp, null at the end.
 *     A malformed cursor 400s VALIDATION_FAILED/INVALID_CURSOR.
 *   - GET /api/activity/my-scan-count (requireAuth) → `{count}`.
 *
 * Freshness rides `audit_log` SSE rows (no dedicated home/activity domain
 * events exist — Scout 3): see ACTIVITY_AUDIT_ACTION_TYPES below.
 */
import { requestJson } from "@/lib/api/coded-error";

/** Canonical home query-key factory — everything nests under `all`. */
export const homeKeys = {
  all: ["home"] as const,
  dashboard: () => ["home", "dashboard"] as const,
  activity: () => ["home", "activity"] as const,
  myScanCount: () => ["home", "myScanCount"] as const,
};

/**
 * Audit actionTypes that mean "a scan_logs / transfer_logs row was written" —
 * i.e. the activity feed and/or the dashboard's scansToday moved. Verified
 * 2026-08-07 against every server-side writer of those tables:
 *   - equipment_scanned      POST /:id/scan + confirm-in-room (scan_logs)
 *   - equipment_checked_out  custody toggle writes a scan_log row
 *   - equipment_returned     custody toggle writes a scan_log row
 *   - equipment_bulk_moved   bulk move writes transfer_log rows
 *   - equipment_updated      PATCH writes a transfer_log row on folder change
 *   - equipment_bulk_deleted bulk delete writes trail scan_log rows
 *   - room_bulk_verified     bulk verify-room writes scan_log rows
 */
export const ACTIVITY_AUDIT_ACTION_TYPES = [
  "equipment_scanned",
  "equipment_checked_out",
  "equipment_returned",
  "equipment_bulk_moved",
  "equipment_updated",
  "equipment_bulk_deleted",
  "room_bulk_verified",
] as const;

/** Active roster shift window (server buildShiftWindow shape). */
export type ShiftWindow = Readonly<{
  startedAt: string;
  endsAt: string;
  role: string;
}>;

/** Next upcoming roster shift — note `startsAt` (server field name, verbatim). */
export type NextShiftWindow = Readonly<{
  startsAt: string;
  endsAt: string;
  role: string;
}>;

export type HomeDashboard = Readonly<{
  shift: ShiftWindow | null;
  nextShift: NextShiftWindow | null;
  /** Consecutive most-recent past days with zero overdue tasks (clinic-wide). */
  streak: number;
  tasksCompletedToday: number;
  scansToday: number;
}>;

export type ActivityScanItem = Readonly<{
  id: string;
  type: "scan";
  equipmentId: string;
  equipmentName: string;
  status: string | null;
  note: string | null;
  userId: string | null;
  userEmail: string | null;
  timestamp: string;
}>;

export type ActivityTransferItem = Readonly<{
  id: string;
  type: "transfer";
  equipmentId: string;
  equipmentName: string;
  fromFolder: string | null;
  toFolder: string | null;
  note: string | null;
  userId: string | null;
  userEmail: string | null;
  timestamp: string;
}>;

export type ActivityItem = ActivityScanItem | ActivityTransferItem;

export type ActivityPage = Readonly<{
  items: ActivityItem[];
  nextCursor: string | null;
}>;

export const homeApi = {
  /** GET /api/home/dashboard — the aggregate daily pulse. */
  getDashboard: async (): Promise<HomeDashboard> =>
    requestJson<HomeDashboard>("/api/home/dashboard"),

  /**
   * GET /api/activity[?cursor=] — one page of the merged scan/transfer feed.
   * `cursor` is the previous page's `nextCursor` (ISO timestamp); null fetches
   * the newest page.
   */
  listActivity: async (cursor: string | null): Promise<ActivityPage> =>
    requestJson<ActivityPage>(
      cursor ? `/api/activity?cursor=${encodeURIComponent(cursor)}` : "/api/activity",
    ),

  /** GET /api/activity/my-scan-count → the caller's all-time scan count. */
  getMyScanCount: async (): Promise<number> => {
    const body = await requestJson<{ count: number }>("/api/activity/my-scan-count");
    return body.count;
  },
};
