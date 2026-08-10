/**
 * Code Blue API module — G4-1 READ-ONLY slice. Server truth (verified
 * read-only against `server/routes/code-blue.ts`, 2026-08-10):
 *
 *   - GET /api/code-blue/sessions/active  requireAuth (student+) — returns
 *     the current active session (or `session: null`) + log entries +
 *     presence + crash-cart status. Reads are universal.
 *
 * No mutation endpoints are wired here (start/end/log/presence) — this slice
 * is display-only by doctrine; write actions arrive in a later G4 slice.
 *
 * DOCTRINE: `codeBlueKeys.active()` must NEVER be added to any React Query
 * persist include-list if one is introduced later (there is none today —
 * verified 2026-08-10: `App.tsx` wraps a plain `QueryClientProvider`, no
 * `persistQueryClient`/`PersistQueryClientProvider`/persister exists anywhere
 * in this repo). Code Blue sessions are on the server's emergency
 * cache-denylist (vettrack CLAUDE.md "Frozen architecture surfaces") — the
 * client-side mirror of that rule is: this key stays in-memory-only, refetched
 * via SSE invalidation, never dehydrated to disk.
 */
import { requestJson } from "@/lib/api/coded-error";
import type { ActiveCodeBlueResponse } from "@/types/code-blue";

/** Canonical Code Blue query-key factory — `active()` derives from `all` (single source of truth). */
export const codeBlueKeys = {
  all: ["code-blue"] as const,
  active: () => [...codeBlueKeys.all, "active"] as const,
};

/**
 * Domain event type emitted by the server on session start/end
 * (`insertRealtimeDomainEvent(tx, { type: "CODE_BLUE_STATUS_CHANGED", ... })`)
 * — verified in BOTH start paths (`POST /api/code-blue/sessions` in
 * `server/routes/code-blue.ts`, AND the one-tap orchestration in
 * `server/lib/code-blue-one-tap.ts`) and the shared end path
 * (`PATCH /api/code-blue/sessions/:id/end`). Reaches the SSE stream verbatim
 * via the outbox publisher.
 */
export const CODE_BLUE_EVENT_TYPE_PREFIXES = ["CODE_BLUE_"] as const;

/**
 * `audit_log` actionTypes that mean the active-session view is stale.
 * `code_blue_log_entry_created` covers new log rows. `code_blue_started` /
 * `code_blue_ended` are belt-and-suspenders alongside
 * `CODE_BLUE_EVENT_TYPE_PREFIXES` above — verified to fire on every start/end
 * path (`server/routes/code-blue.ts` logAudit calls at both the classic and
 * one-tap start sites, and at session end) — so the empty<->active transition
 * still refreshes even if a future refactor ever drops the domain event on
 * one path. Deliberately EXCLUDES `code_blue_presence_heartbeat`: the web
 * client sends a heartbeat every 10s per participant
 * (`useCodeBlueSession.ts`), so subscribing to it would refetch the
 * active-session query every few seconds during a live Code Blue. Presence in
 * this read-only viewer refreshes on the next status/log event or SSE
 * reconnect instead.
 */
export const CODE_BLUE_AUDIT_ACTION_TYPES = [
  "code_blue_log_entry_created",
  "code_blue_started",
  "code_blue_ended",
] as const;

export const codeBlueApi = {
  /** GET /api/code-blue/sessions/active — poll-shaped endpoint, fetched only on mount + SSE invalidation (never on a timer). */
  active: (): Promise<ActiveCodeBlueResponse> =>
    requestJson<ActiveCodeBlueResponse>("/api/code-blue/sessions/active"),
};
