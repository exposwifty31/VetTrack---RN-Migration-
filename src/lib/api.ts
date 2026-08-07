import type { EquipmentTruthResponse, EquipmentWaitlistSnapshot } from "@vettrack/shared";
import * as Crypto from "expo-crypto";

import { authFetch } from "@/lib/auth-fetch";
import { setCurrentUserId } from "@/lib/auth-store";
import type {
  ConflictResult,
  EquipmentCheckoutResponse,
  EquipmentDeployability,
  EquipmentDetail,
  EquipmentListPage,
  EquipmentListResult,
  EquipmentLogsPage,
  EquipmentReturnResponse,
  EquipmentRow,
  EquipmentStatusReportResponse,
  EquipmentStatusValue,
  EquipmentTransferItem,
  MeUser,
  OutboxHead,
  QuickScanToggleResult,
  ScanResult,
} from "@/types/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status} for ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Canonical equipment query key — the single invalidation target for the hero flow. */
export const equipmentKeys = {
  all: ["equipment"] as const,
  list: (params?: EquipmentListParams) => {
    // Normalize empty params to "no params" so one logical page maps to one
    // query key: `EquipmentListScreen` builds `{}` when the search box is empty,
    // and `equipmentKeys.list({})` must target the same entry as `list()`.
    const hasParams =
      params != null && Object.values(params).some((v) => v != null && v !== "");
    return hasParams
      ? (["equipment", "list", params] as const)
      : (["equipment", "list"] as const);
  },
  detail: (id: string) => ["equipment", "detail", id] as const,
  // Detail sub-resources nest under detail(id): equipmentKeys.all invalidation
  // (the SSE hook + useScanToggle onSettled) covers every one of them, and a
  // targeted detail(id) invalidation refreshes the whole detail screen.
  logs: (id: string) => ["equipment", "detail", id, "logs"] as const,
  transfers: (id: string) => ["equipment", "detail", id, "transfers"] as const,
  waitlist: (id: string) => ["equipment", "detail", id, "waitlist"] as const,
  deployability: (id: string) => ["equipment", "detail", id, "deployability"] as const,
  truth: (id: string) => ["equipment", "detail", id, "truth"] as const,
};

export type EquipmentListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  folder?: string;
  location?: string;
};

/** Conflict `reason` values that map to a first-class custody conflict (vs. a gate block). */
const CONFLICT_REASONS = new Set([
  "EQUIPMENT_ALREADY_CHECKED_OUT",
  "CUSTODY_RETURN_VERSION_CONFLICT",
  "VERSION_CONFLICT",
]);

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildEquipmentQuery(params?: EquipmentListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  if (params.page != null) search.set("page", String(params.page));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.folder) search.set("folder", params.folder);
  if (params.location) search.set("location", params.location);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Grow per slice — start with endpoints needed by G1 foundation + the G2 hero flow. */
export const api = {
  users: {
    me: async (): Promise<MeUser> => {
      const me = await requestJson<MeUser>("/api/users/me");
      if (me.id) setCurrentUserId(me.id);
      return me;
    },
  },
  realtime: {
    outboxHead: () => requestJson<OutboxHead>("/api/realtime/outbox-head"),
    replay: (afterId: number, limit = 100) =>
      requestJson<{ events: unknown[] }>(
        `/api/realtime/replay?afterId=${encodeURIComponent(String(afterId))}&limit=${limit}`,
      ),
  },
  equipment: {
    /**
     * Hero scan action — POST /api/equipment/scan { equipmentId }. Accepts arbitrary
     * tag ids (NOT UUID-constrained). Bespoke, non-throwing: maps 200/409/404/other
     * to a closed `ScanResult` union instead of routing through the throwing
     * `requestJson` (which would destroy the flat 409 conflict body). Online-only:
     * a network/401 failure propagates as AuthFetchError so the mutation fails loud.
     */
    scan: async (equipmentId: string): Promise<ScanResult> => {
      const res = await authFetch("/api/equipment/scan", {
        method: "POST",
        body: JSON.stringify({ equipmentId }),
        headers: { "x-request-id": Crypto.randomUUID() },
      });

      if (res.ok) {
        // Validate the 200 body before returning `kind: "ok"`. A malformed body
        // (missing `equipment`/`action`) would otherwise make `onSuccess` in
        // `useScanToggle` read `result.equipment.id` and throw inside the
        // mutation callback. `readJsonSafe` also honors the non-throwing contract
        // if `res.json()` rejects. Degrade to `blocked_precondition` on a bad shape.
        const body = await readJsonSafe(res);
        const equipment = body.equipment as Partial<EquipmentRow> | undefined;
        const action = body.action;
        const scanLogId = body.scanLogId;
        const undoToken = body.undoToken;
        // Validate the COMPLETE success contract — a partial row would poison the
        // cache via onSuccess, and an empty undoToken would be posted to /revert.
        const isRow =
          !!equipment &&
          typeof equipment === "object" &&
          typeof equipment.id === "string" &&
          typeof equipment.name === "string" &&
          typeof equipment.status === "string" &&
          typeof equipment.custodyState === "string" &&
          typeof equipment.version === "number";
        const validShape =
          isRow &&
          (action === "checkout" || action === "return") &&
          typeof scanLogId === "string" &&
          scanLogId.length > 0 &&
          typeof undoToken === "string" &&
          undoToken.length > 0;
        if (!validShape) {
          return { kind: "blocked_precondition", code: "MALFORMED_SCAN_RESPONSE" };
        }
        return {
          kind: "ok",
          equipment: equipment as EquipmentRow,
          action: action as "checkout" | "return",
          scanLogId: scanLogId as string,
          undoToken: undoToken as string,
        };
      }

      if (res.status === 404) {
        return { kind: "not_found" };
      }

      const body = await readJsonSafe(res);
      const code = typeof body.code === "string" ? body.code : `HTTP_${res.status}`;
      const message = typeof body.message === "string" ? body.message : undefined;
      const reason = typeof body.reason === "string" ? body.reason : "";

      if (res.status === 409 && CONFLICT_REASONS.has(reason)) {
        return {
          kind: "conflict",
          reason: reason as ConflictResult["reason"],
          checkedOutByEmail:
            typeof body.checkedOutByEmail === "string" ? body.checkedOutByEmail : undefined,
          code,
          message,
        };
      }

      // Gate / staging / waitlist / bundle preconditions (409/422 with a non-custody reason).
      return { kind: "blocked_precondition", code, message };
    },

    /**
     * Equipment list — GET /api/equipment. ETag is the sanctioned no-refetch
     * mechanism (NOT polling): passes `If-None-Match` and treats a bodiless 304 as a
     * cache-hit WITHOUT calling res.json() (the body is empty on 304).
     */
    list: async (params?: EquipmentListParams, etag?: string): Promise<EquipmentListResult> => {
      const headers: Record<string, string> = {};
      if (etag) headers["If-None-Match"] = etag;
      const res = await authFetch(`/api/equipment${buildEquipmentQuery(params)}`, { headers });

      if (res.status === 304) {
        return { status: 304 };
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for /api/equipment`);
      }
      const data = (await res.json()) as EquipmentListPage;
      const nextEtag = res.headers.get("ETag") ?? undefined;
      return { status: 200, data, etag: nextEtag };
    },

    /**
     * Undo a scan (POST /:id/revert). `requireEffectiveRole('vet')` server-side —
     * the caller MUST pre-gate the affordance on `effectiveRole >= 'vet'` (see
     * `canUndoScan`). Returns the BARE updated row (not wrapped in `{equipment}`).
     */
    revert: (equipmentId: string, undoToken: string) =>
      // Encode the id: NFC/route-derived ids can contain `/`, `?`, `#`, or dot
      // segments that would otherwise reshape the request path (CWE-29).
      requestJson<EquipmentRow>(`/api/equipment/${encodeURIComponent(equipmentId)}/revert`, {
        method: "POST",
        body: JSON.stringify({ undoToken }),
      }),

    /** Legacy UUID-only toggle (POST /:id/toggle). NOT used in the hero path. */
    quickToggle: (equipmentId: string) =>
      requestJson<QuickScanToggleResult>(`/api/equipment/${encodeURIComponent(equipmentId)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ isPluggedIn: true }),
      }),

    // ── Slice 2: equipment detail reads ─────────────────────────────────────
    // Every path id is encodeURIComponent-ed (CWE-29, the `revert` idiom):
    // NFC/route-derived ids can contain `/`, `?`, `#`, or dot segments.

    /** GET /api/equipment/:id — detail read (joined folder/room/verifier names). */
    byId: (equipmentId: string) =>
      requestJson<EquipmentDetail>(`/api/equipment/${encodeURIComponent(equipmentId)}`),

    /** GET /:id/logs — paginated scan history (server clamps limit to ≤200, default 50). */
    logs: (equipmentId: string, page = 1, limit = 20) =>
      requestJson<EquipmentLogsPage>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/logs?page=${page}&limit=${limit}`,
      ),

    /** GET /:id/transfers — bare array, newest first. */
    transfers: (equipmentId: string) =>
      requestJson<EquipmentTransferItem[]>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/transfers`,
      ),

    /** GET /api/equipment/:equipmentId/deployability (operational-state router, bare /api mount). */
    deployability: (equipmentId: string) =>
      requestJson<EquipmentDeployability>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/deployability`,
      ),

    /** GET /:id/truth — Asset Copilot evidence graph (vendored contract type). */
    truth: (equipmentId: string) =>
      requestJson<EquipmentTruthResponse>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/truth`,
      ),

    // ── Slice 2: waitlist ───────────────────────────────────────────────────

    /** GET /:id/waitlist — snapshot (queueSize, myPosition, entries). student+ floor. */
    waitlist: (equipmentId: string) =>
      requestJson<EquipmentWaitlistSnapshot>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/waitlist`,
      ),

    /** POST /:id/waitlist — join (201, fresh snapshot; 409 WAITLIST_ALREADY_JOINED). */
    joinWaitlist: (equipmentId: string) =>
      requestJson<EquipmentWaitlistSnapshot>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/waitlist`,
        { method: "POST" },
      ),

    /** DELETE /:id/waitlist — leave (fresh snapshot; 404 WAITLIST_NOT_ON_WAITLIST). */
    leaveWaitlist: (equipmentId: string) =>
      requestJson<EquipmentWaitlistSnapshot>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/waitlist`,
        { method: "DELETE" },
      ),

    // ── Slice 2: custody mutations (direct endpoints) ───────────────────────
    // All three carry `equipmentReplayIdempotency` server-side — send the
    // established scan idiom's `x-request-id` so a replayed request dedupes.

    /** POST /:id/checkout {location?, emergencyReason?} → {equipment, undoToken}. */
    checkout: (equipmentId: string, body: { location?: string; emergencyReason?: string } = {}) =>
      requestJson<EquipmentCheckoutResponse>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/checkout`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "x-request-id": Crypto.randomUUID() },
        },
      ),

    /**
     * POST /:id/return {isPluggedIn?, plugInDeadlineMinutes?} — the direct
     * return path that feeds charge tracking (`isPluggedIn: false` schedules
     * the charge alert; deadline defaults server-side to 30 min).
     */
    returnEquipment: (
      equipmentId: string,
      body: { isPluggedIn?: boolean; plugInDeadlineMinutes?: number } = {},
    ) =>
      requestJson<EquipmentReturnResponse>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/return`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "x-request-id": Crypto.randomUUID() },
        },
      ),

    /**
     * POST /:id/scan {status, note?, photoUrl?} — the status-report path.
     * Report-issue = status "issue"; the server 400s (ISSUE_NOTE_REQUIRED)
     * when the note is empty, so the UI requires it before submitting.
     */
    reportStatus: (
      equipmentId: string,
      body: { status: EquipmentStatusValue; note?: string; photoUrl?: string },
    ) =>
      requestJson<EquipmentStatusReportResponse>(
        `/api/equipment/${encodeURIComponent(equipmentId)}/scan`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "x-request-id": Crypto.randomUUID() },
        },
      ),
  },
};
