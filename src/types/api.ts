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
