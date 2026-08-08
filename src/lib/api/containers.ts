/**
 * Containers / dispense / restock-session API module (G3 Slice 10) — a
 * per-domain module under `src/lib/api/` (G3-PLAN §2 rule 3; never grows the
 * shared `api.ts`). Reuses the shared coded-error plumbing (`requestJson` /
 * `ApiCodedError`) so screens branch on the stable server `code`/`reason`.
 *
 * Server truth (verified 2026-08-08 against the vettrack repo, read-only —
 * server/routes/containers.ts, server/routes/restock.ts,
 * server/middleware/container-dispense-idempotency.ts,
 * server/lib/clinical-invariant-error.ts):
 *
 *   GET  /api/containers                    student floor; bare array (list)
 *   GET  /api/containers?nfcTagId=          student floor; single {…container, items} or 404
 *   POST /api/containers/:id/dispense       student floor; REQUIRES `Idempotency-Key`
 *                                           header; :id must be a UUID
 *   PATCH /api/containers/emergency/:id/complete   student floor
 *   POST /api/restock/{start,scan,finish,cancel,container-items}   student floor
 *
 *   POST /api/containers/:id/restock        DISABLED → 409 LEGACY_RESTOCK_DISABLED
 *   POST /api/containers/:id/blind-audit    DISABLED → 409 LEGACY_RESTOCK_DISABLED
 *   (both intentionally NOT wired — the /api/restock/* session program is the
 *    real path; its per-item absolute observedQuantity IS the blind audit.)
 *
 * Dispense error surface (screens map via the isX helpers below):
 *   400 VALIDATION_FAILED (IDEMPOTENCY_KEY_REQUIRED | zod)
 *   400 code=ORPHAN_DISPENSE_BLOCKED     (legacy evaluateDispenseAgainstOrders)
 *   422 code=CLINICAL_INVARIANT_VIOLATION reason=ORPHAN_DISPENSE_BLOCKED (enforce)
 *   409 INSUFFICIENT_STOCK | IDEMPOTENCY_CONFLICT
 *   404 NOT_FOUND (CONTAINER_NOT_FOUND | INVENTORY_ITEM_NOT_FOUND)
 *   503 COP_VALIDATION_UNAVAILABLE | SERVICE_UNAVAILABLE
 */
import { ApiCodedError, requestJson } from "@/lib/api/coded-error";
import type {
  ContainerInventoryView,
  ContainerListItem,
  ContainerWithItems,
  DispenseRequest,
  DispenseResult,
  RestockSessionRow,
} from "@/types/containers";

export { retryUnlessClientError } from "@/lib/api/coded-error";

/** Canonical containers query-key factory — everything nests under `all`. */
export const containerKeys = {
  all: ["containers"] as const,
  list: () => ["containers", "list"] as const,
  /** Restock inventory view for one container (dispense picker + restock counts). */
  items: (containerId: string) => ["containers", "items", containerId] as const,
};

/**
 * Container/dispense audit actionTypes — verified members of the closed
 * AuditActionType union (server/lib/audit.ts). These `audit_log` outbox rows
 * are the SSE invalidation channel for the container list (containers emit no
 * dedicated domain events — Scout 3 / seam §6.4). The restock SESSION program
 * emits no audit rows, so restock freshness is imperative (invalidate on
 * finish), never polled.
 */
export const CONTAINER_AUDIT_ACTION_TYPES = [
  "inventory_dispensed",
  "dispense_confirmed",
  "dispense_emergency_created",
  "emergency_dispense_reconciled",
  "container_created",
  "containers_defaults_seeded",
] as const;

/**
 * Orphan-dispense block — the SAME clinical guard surfaces on TWO shapes:
 *   - legacy `evaluateDispenseAgainstOrders` → HTTP 400, code ORPHAN_DISPENSE_BLOCKED
 *   - clinical-invariant enforce mode        → HTTP 422, code CLINICAL_INVARIANT_VIOLATION,
 *                                              reason ORPHAN_DISPENSE_BLOCKED
 * Branch on either so a mode flip never changes the UX. Loud translated error.
 */
export function isOrphanDispenseBlocked(error: unknown): boolean {
  return (
    error instanceof ApiCodedError &&
    (error.code === "ORPHAN_DISPENSE_BLOCKED" || error.reason === "ORPHAN_DISPENSE_BLOCKED")
  );
}

/** 409 INSUFFICIENT_STOCK — a requested quantity exceeds on-hand. */
export function isInsufficientStock(error: unknown): boolean {
  return error instanceof ApiCodedError && error.code === "INSUFFICIENT_STOCK";
}

/**
 * The roster-derived off-shift signal — 403 INSUFFICIENT_ROLE from the student
 * floor (an off-shift user resolves below `student`). Drives the dedicated
 * empty-state, never an error toast (G3-PLAN §1.6).
 */
export function isOffShiftError(error: unknown): boolean {
  return (
    error instanceof ApiCodedError && error.status === 403 && error.code === "INSUFFICIENT_ROLE"
  );
}

/** 409 SESSION_ALREADY_ACTIVE — a restock session already exists; resume it. */
export function isSessionAlreadyActive(error: unknown): boolean {
  return error instanceof ApiCodedError && error.code === "SESSION_ALREADY_ACTIVE";
}

/** i18n key for a dispense failure — the loud, translated branch per error class. */
export type DispenseErrorKey =
  | "dispense.blocked"
  | "dispense.insufficientStock"
  | "dispense.conflict"
  | "dispense.error";

export function dispenseErrorMessageKey(error: unknown): DispenseErrorKey {
  if (isOrphanDispenseBlocked(error)) return "dispense.blocked";
  if (isInsufficientStock(error)) return "dispense.insufficientStock";
  if (error instanceof ApiCodedError && error.code === "IDEMPOTENCY_CONFLICT") {
    return "dispense.conflict";
  }
  return "dispense.error";
}

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "Content-Type": "application/json", ...extra };
}

export const containersApi = {
  /** GET /api/containers — bare array of containers (student floor). */
  list: (): Promise<ContainerListItem[]> => requestJson<ContainerListItem[]>("/api/containers"),

  /**
   * GET /api/containers?nfcTagId= — a single container WITH items, or `null`
   * when the server 404s (no container for that tag). Non-404 failures throw so
   * the caller can distinguish a genuine error from a miss.
   */
  getByNfcTag: async (nfcTagId: string): Promise<ContainerWithItems | null> => {
    try {
      return await requestJson<ContainerWithItems>(
        `/api/containers?nfcTagId=${encodeURIComponent(nfcTagId)}`,
      );
    } catch (error) {
      if (error instanceof ApiCodedError && error.status === 404) return null;
      throw error;
    }
  },

  /**
   * POST /api/containers/:id/dispense — the `Idempotency-Key` is minted by the
   * caller (stable across retries of the SAME payload) so a retry after a
   * network drop replays the server-cached result instead of double-decrementing
   * stock. `x-request-id` mirrors the established scan idiom for log correlation.
   */
  dispense: (
    containerId: string,
    body: DispenseRequest,
    idempotencyKey: string,
  ): Promise<DispenseResult> =>
    requestJson<DispenseResult>(`/api/containers/${encodeURIComponent(containerId)}/dispense`, {
      method: "POST",
      headers: jsonHeaders({ "Idempotency-Key": idempotencyKey, "x-request-id": idempotencyKey }),
      body: JSON.stringify(body),
    }),

  /** PATCH /api/containers/emergency/:eventId/complete — closes a pending emergency. */
  completeEmergency: (
    eventId: string,
    items: readonly { itemId: string; quantity: number }[],
  ): Promise<DispenseResult> =>
    requestJson<DispenseResult>(
      `/api/containers/emergency/${encodeURIComponent(eventId)}/complete`,
      { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ items }) },
    ),
};

/**
 * Restock SESSION program (`/api/restock/*`, all student floor). Container-level
 * restock/blind-audit are disabled server-side; this is the working path. The
 * per-item absolute `observedQuantity` in `scan` is the blind physical count.
 */
export const restockApi = {
  /** POST /api/restock/container-items — inventory view (dispense + restock source). */
  containerItems: (containerId: string): Promise<ContainerInventoryView> =>
    requestJson<ContainerInventoryView>("/api/restock/container-items", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ containerId }),
    }),

  /** POST /api/restock/start — 201 session; 409 SESSION_ALREADY_ACTIVE if one exists. */
  start: (containerId: string): Promise<RestockSessionRow> =>
    requestJson<RestockSessionRow>("/api/restock/start", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ containerId }),
    }),

  /** POST /api/restock/scan — record one item's absolute observed count. */
  scan: (
    sessionId: string,
    itemId: string,
    observedQuantity: number,
  ): Promise<unknown> =>
    requestJson<unknown>("/api/restock/scan", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ sessionId, itemId, observedQuantity }),
    }),

  /** POST /api/restock/finish — commit the session (mutates container_items). */
  finish: (sessionId: string): Promise<unknown> =>
    requestJson<unknown>("/api/restock/finish", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ sessionId }),
    }),

  /** POST /api/restock/cancel — abandon the session; no inventory mutation. */
  cancel: (sessionId: string): Promise<unknown> =>
    requestJson<unknown>("/api/restock/cancel", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ sessionId }),
    }),
};
