/**
 * Inventory container + dispense + restock-session types (G3 Slice 10).
 *
 * Every shape here is transcribed from the live server route/service code
 * (read-only, verified 2026-08-08 against the vettrack repo), NOT from the
 * plan prose:
 *   - list/nfc-lookup    → server/routes/containers.ts GET "/"
 *   - dispense           → server/routes/containers.ts POST "/:id/dispense"
 *   - emergency complete → server/routes/containers.ts PATCH "/emergency/:eventId/complete"
 *   - restock session    → server/routes/restock.ts + services/restock.service.ts
 *
 * NOTE (load-bearing): POST /api/containers/:id/restock and
 * POST /api/containers/:id/blind-audit are DISABLED server-side (they return
 * 409 LEGACY_RESTOCK_DISABLED). The working, mobile-usable (student-floor)
 * restock/audit path is the /api/restock/* session program — its per-item
 * absolute `observedQuantity` IS the blind physical count. See containers.ts.
 */

/** Blueprint supply target for a container (server config/inventoryBlueprint.ts). */
export type SupplyTarget = Readonly<{
  code: string;
  label: string;
  targetUnits: number;
}>;

/**
 * A container row from `GET /api/containers` (bare array). `currentQuantity` is
 * the SUM of its container-items; `supplyTargets` comes from the name-matched
 * blueprint (empty array for ad-hoc containers).
 */
export type ContainerListItem = Readonly<{
  id: string;
  clinicId: string;
  name: string;
  department: string;
  targetQuantity: number;
  currentQuantity: number;
  roomId: string | null;
  nfcTagId: string | null;
  supplyTargets: readonly SupplyTarget[];
}>;

/** An item line inside a container, from `GET /api/containers?nfcTagId=`. */
export type ContainerTaggedItem = Readonly<{
  id: string;
  itemId: string;
  quantity: number;
  label: string | null;
  code: string | null;
}>;

/** `GET /api/containers?nfcTagId=` → a single container WITH its items (or 404). */
export type ContainerWithItems = ContainerListItem &
  Readonly<{ items: readonly ContainerTaggedItem[] }>;

/**
 * A line from the restock inventory view (`POST /api/restock/container-items`,
 * `getContainerInventoryView`). `itemId` is null for a blueprint target with no
 * matching stocked item. This view is the single item source for BOTH the
 * dispense picker (lines with `itemId != null && actual > 0`) and the restock
 * observed-count flow.
 */
export type ContainerInventoryLine = Readonly<{
  itemId: string | null;
  code: string;
  label: string;
  nfcTagId: string | null;
  expected: number;
  actual: number;
  missing: number;
  isScannedThisSession: boolean;
  isUnscanned: boolean;
  sessionObservedQuantity: number | null;
}>;

export type RestockSessionRow = Readonly<{
  id: string;
  clinicId: string;
  containerId: string;
  ownedByUserId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}>;

export type ContainerInventoryView = Readonly<{
  container: ContainerListItem;
  lines: readonly ContainerInventoryLine[];
  activeSession: RestockSessionRow | null;
  sessionProgress: Readonly<{
    scannedCount: number;
    totalCount: number;
    unscannedCount: number;
  }> | null;
}>;

/** Closed server enum — required when `isEmergency=true` (Zod refine). */
export type BypassReason = "EMERGENCY_CPR" | "PROTOCOL_OVERRIDE" | "TECH_ERROR";

export const BYPASS_REASONS: readonly BypassReason[] = [
  "EMERGENCY_CPR",
  "PROTOCOL_OVERRIDE",
  "TECH_ERROR",
] as const;

export type DispenseLineInput = Readonly<{ itemId: string; quantity: number }>;

export type DispenseRequest = Readonly<{
  items: readonly DispenseLineInput[];
  isEmergency: boolean;
  bypassReason?: BypassReason;
}>;

export type DispensedLine = Readonly<{
  itemId: string;
  label: string;
  quantity: number;
  newStock: number;
}>;

/** `POST /:id/dispense` normal / immediate-emergency success shape. */
export type DispenseResult = Readonly<{
  success: boolean;
  dispensed: readonly DispensedLine[];
  takenBy: Readonly<{ userId: string; displayName: string }>;
  takenAt: string;
  billingIds: readonly string[];
  autoBilledCents: number;
}>;
