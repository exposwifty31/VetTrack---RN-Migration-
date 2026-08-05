import * as Crypto from "expo-crypto";

import { authFetch } from "@/lib/auth-fetch";
import { setCurrentUserId } from "@/lib/auth-store";
import type {
  ConflictResult,
  EquipmentListPage,
  EquipmentListResult,
  EquipmentRow,
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
  },
};
