/**
 * Wire contract types for the G2 scan→checkout hero flow.
 *
 * The action literals here are the SERVICE KIND literals the server actually
 * emits (`equipment-custody-toggle.service.ts`): `checkout | return | blocked`.
 * The previous `checked_out | returned` were wrong and produced silently-dead
 * `switch(action)` arms — corrected here first, before any consumer is written.
 */

/** Service-kind literal returned by /api/equipment/scan and /:id/toggle. */
export type QuickScanToggleAction = "checkout" | "return" | "blocked";

export type MeUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  clinicId?: string | null;
  status?: string;
  /**
   * The role the SERVER enforces on scan/undo (users.ts:112) — NOT base `role`.
   * The undo affordance must pre-gate on this exact field (undo is vet-only).
   */
  effectiveRole: string;
  roleSource?: string;
  activeShift?: unknown;
};

/**
 * Minimal equipment row — sourced from the server equipment schema. The scan
 * 200 body returns a full row; only the fields the hero flow renders/reconciles
 * are modelled here.
 */
export type EquipmentRow = {
  id: string;
  name: string;
  status: string;
  custodyState: string;
  checkedOutByEmail?: string;
  checkedOutById?: string;
  version: number;
  lastSeen?: string | null;
  /**
   * G2.5 Aurora home — operational fields the list endpoint ALREADY returns
   * (server `get-equipment-list.ts` selects `equipmentOperationalStateSelect` +
   * checkout columns). Optional so an older server shape degrades to the honest
   * empty/all-clear states instead of fabricating metrics.
   * Known values — readinessState: ready|not_ready|unknown;
   * usageState: available|in_use|staged|emergency_use.
   */
  readinessState?: string | null;
  usageState?: string | null;
  checkedOutAt?: string | null;
  expectedReturnMinutes?: number | null;
};

/** Legacy toggle result (POST /:id/toggle). Kept for the untouched `quickToggle`. */
export type QuickScanToggleResult = {
  equipment: { id: string; name?: string; status?: string };
  action: QuickScanToggleAction;
  scanLogId: string;
  undoToken: string;
  checkedOutByEmail?: string;
};

/** Scan 200 — a successful custody flip. */
export type ScanSuccess = {
  kind: "ok";
  equipment: EquipmentRow;
  action: "checkout" | "return";
  scanLogId: string;
  undoToken: string;
};

/** Scan 409 — the item is held by someone else / a version conflict. */
export type ConflictResult = {
  kind: "conflict";
  reason:
    | "EQUIPMENT_ALREADY_CHECKED_OUT"
    | "CUSTODY_RETURN_VERSION_CONFLICT"
    | "VERSION_CONFLICT";
  /** Flat top-level sibling on the apiError envelope (route-utils.ts:29). */
  checkedOutByEmail?: string;
  code: string;
  message?: string;
};

/** Closed union — a `switch(result.kind)` over this is exhaustive. */
export type ScanResult =
  | ScanSuccess
  | ConflictResult
  | { kind: "not_found" }
  | { kind: "blocked_precondition"; code: string; message?: string };

/** Equipment list page (GET /api/equipment). */
export type EquipmentListPage = {
  items: EquipmentRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** List result — 304 signals an ETag cache-hit and carries NO body. */
export type EquipmentListResult =
  | { status: 200; data: EquipmentListPage; etag?: string }
  | { status: 304 };

export type OutboxHead = { maxPublishedId: number };

/** Server `EQUIPMENT_STATUS_VALUES` (equipment.ts:61) — the /:id/scan status enum. */
export type EquipmentStatusValue =
  | "ok"
  | "issue"
  | "maintenance"
  | "sterilized"
  | "overdue"
  | "inactive"
  | "critical"
  | "needs_attention";

/**
 * GET /api/equipment/:id — the detail read (get-equipment-by-id.ts select).
 * Joined names (folderName/roomName/lastVerifiedByName) come from the handler's
 * leftJoins; `custodyState`/`readinessState`/`usageState` from the operational
 * select. The endpoint returns NO `version` column — do not model one here.
 * Everything beyond the identity trio is optional so an older server shape
 * degrades to honest empty renders instead of crashing sections.
 */
export type EquipmentDetail = {
  id: string;
  name: string;
  status: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  location?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  nfcTagId?: string | null;
  lastVerifiedAt?: string | null;
  lastVerifiedByName?: string | null;
  lastSeen?: string | null;
  lastStatus?: string | null;
  lastMaintenanceDate?: string | null;
  lastSterilizationDate?: string | null;
  maintenanceIntervalDays?: number | null;
  imageUrl?: string | null;
  checkedOutById?: string | null;
  checkedOutByEmail?: string | null;
  checkedOutAt?: string | null;
  checkedOutLocation?: string | null;
  expectedReturnMinutes?: number | null;
  createdAt?: string | null;
  usuallyFoundHere?: string | null;
  searchAlias?: string | null;
  staffNote?: string | null;
  custodyState?: string;
  readinessState?: string | null;
  usageState?: string | null;
};

/** One scan-log row (GET /:id/logs). staffName/staffRole appear on admin reads only. */
export type EquipmentLogItem = {
  id: string;
  equipmentId: string;
  userId?: string | null;
  userEmail?: string | null;
  status: string;
  note?: string | null;
  photoUrl?: string | null;
  timestamp: string;
  staffName?: string | null;
  staffRole?: string | null;
};

/** GET /:id/logs — page envelope (default limit 50, max 200). */
export type EquipmentLogsPage = {
  items: EquipmentLogItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** One transfer row (GET /:id/transfers — bare array, newest first). */
export type EquipmentTransferItem = {
  id: string;
  equipmentId?: string | null;
  fromFolderName?: string | null;
  toFolderName?: string | null;
  userId?: string | null;
  note?: string | null;
  timestamp: string;
};

/** GET /api/equipment/:equipmentId/deployability (equipment-operational-state.ts:162). */
export type EquipmentDeployability = {
  equipmentId: string;
  custodyState: string;
  readinessState: string;
  usageState: string;
  fullDeployable: boolean;
  bundleGate: {
    ok: boolean;
    reason?: string;
    failedConditions?: string[];
    staleConditions?: string[];
    unknownConditions?: string[];
  };
  asOfMs: number;
};

/** POST /:id/checkout 200 — `{equipment, undoToken}` (undoToken empty on emergency path). */
export type EquipmentCheckoutResponse = {
  equipment: EquipmentRow;
  undoToken: string;
};

/** vt_equipment_returns row (finalizeReturnSideEffects → equipmentReturns.$inferSelect). */
export type EquipmentReturnRecord = {
  id: string;
  clinicId: string;
  equipmentId: string;
  returnedById: string;
  returnedByEmail: string;
  returnedAt: string;
  isPluggedIn: boolean;
  plugInDeadlineMinutes: number;
  plugInAlertSentAt?: string | null;
  chargeAlertJobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** POST /:id/return 200 — returnRecord null when the item was already returned. */
export type EquipmentReturnResponse = {
  equipment: EquipmentRow;
  undoToken: string;
  returnRecord: EquipmentReturnRecord | null;
};

/** POST /:id/scan 200 — the status-report path (report-issue uses status "issue"). */
export type EquipmentStatusReportResponse = {
  equipment: EquipmentRow;
  scanLog: EquipmentLogItem | null;
  undoToken: string;
};
