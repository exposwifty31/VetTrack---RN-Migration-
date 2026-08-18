/**
 * Code Blue API module. Server truth (verified read-only against
 * `server/routes/code-blue.ts`, 2026-08-10):
 *
 *   - GET /api/code-blue/sessions/active  requireAuth (student+) — returns
 *     the current active session (or `session: null`) + log entries +
 *     presence + crash-cart status. Reads are universal.
 *   - POST /api/code-blue/one-tap               — orchestrated start (J1)
 *   - POST /api/code-blue/sessions              — legacy/equipment start (G4-5)
 *   - POST /api/code-blue/sessions/:id/logs      — add log entry (G4-5)
 *   - PATCH /api/code-blue/sessions/:id/end      — end session (G4-5)
 *   - PATCH /api/code-blue/sessions/:id/presence — presence heartbeat (G4-5)
 *
 * G4-5 doctrine: all four mutation endpoints below are on the emergency
 * offline-block manifest (`@vettrack/contracts`) — an offline attempt throws
 * `EmergencyOfflineError` from `authFetch` (via `requestJson`), NEVER queued
 * or retried (see `src/lib/emergency-block.ts`, `auth-fetch.emergency.test.ts`
 * which already proves this for all four endpoints). Nothing in this module
 * catches or reroutes that error — it propagates to the mutation hook
 * untouched, which is the contract `useCodeBlueMutations` relies on.
 *
 * DOCTRINE: `codeBlueKeys.active()` must NEVER be added to any React Query
 * persist include-list if one is introduced later (there is none today —
 * verified 2026-08-10: `App.tsx` wraps a plain `QueryClientProvider`, no
 * `persistQueryClient`/`PersistQueryClientProvider`/persister exists anywhere
 * in this repo). Code Blue sessions are on the server's emergency
 * cache-denylist (vettrack CLAUDE.md "Frozen architecture surfaces") — the
 * client-side mirror of that rule is: this key stays in-memory-only, refetched
 * via SSE invalidation or a mutation's own post-success invalidation, never
 * dehydrated to disk.
 */
import { requestJson } from "@/lib/api/coded-error";
import type {
  ActiveCodeBlueResponse,
  EndSessionRequest,
  EndSessionResponse,
  LogEntryRequest,
  LogEntryResponse,
  OneTapStartRequest,
  OneTapStartResponse,
  PresenceResponse,
  StartCodeBlueRequest,
  StartCodeBlueResponse,
} from "@/types/code-blue";

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

  /**
   * POST /api/code-blue/one-tap — THE canonical start path (J1).
   *
   * `payload.idempotencyToken` is the durable fence: the server keys a
   * `vt_code_blue_start_claims` row on it and commits that claim inside the
   * same transaction as the session insert, so re-sending the SAME token after
   * a lost response replays the original session (`outcome: "replay"`) instead
   * of racing a second start. The token is minted per start GESTURE by the
   * caller (`resolveOneTapStartToken`), never per attempt — minting per attempt
   * would defeat the fence.
   *
   * On the emergency offline-block manifest as class "start" (verified in the
   * vendored `@vettrack/contracts` at the pinned VETTRACK_SHA), so an offline
   * attempt throws `EmergencyOfflineError` and is never queued — identical
   * doctrine to the other four mutations above.
   */
  oneTap: (payload: OneTapStartRequest): Promise<OneTapStartResponse> =>
    requestJson<OneTapStartResponse>("/api/code-blue/one-tap", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * POST /api/code-blue/sessions — the LEGACY start. Retained, not deleted:
   * it is the only path that accepts an `equipmentId` to link at start, which
   * one-tap has no field for (one-tap links its own reserved cart instead).
   * NOT used by the start button — see `useCodeBlueMutations`. Online-only.
   *
   * IT THEREFORE HAS ZERO PRODUCTION CALLERS TODAY, and that is the exact
   * shape this migration keeps tripping over: a capability built, then left
   * unplugged (A3, B2, B4, C1, F1 in the remediation plan all turned out to be
   * this). Retaining it is a judgement call, not an oversight — but a retained
   * function with no named destination is how the pile grows.
   *
   * DESTINATION: the equipment-initiated start (scan a crash cart -> start a
   * Code Blue already linked to it), which the Capacitor app has at
   * `equipment-detail` and RN does not. If that slice is dropped or absorbed
   * into one-tap, DELETE this — git remembers it.
   */
  start: (payload: StartCodeBlueRequest): Promise<StartCodeBlueResponse> =>
    requestJson<StartCodeBlueResponse>("/api/code-blue/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** POST /api/code-blue/sessions/:id/logs — add a log entry. Online-only (emergency-blocked offline). */
  addLogEntry: (sessionId: string, payload: LogEntryRequest): Promise<LogEntryResponse> =>
    requestJson<LogEntryResponse>(`/api/code-blue/sessions/${encodeURIComponent(sessionId)}/logs`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** PATCH /api/code-blue/sessions/:id/end — close out (manager-only, server-enforced). Online-only. */
  end: (sessionId: string, payload: EndSessionRequest): Promise<EndSessionResponse> =>
    requestJson<EndSessionResponse>(`/api/code-blue/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /** PATCH /api/code-blue/sessions/:id/presence — heartbeat, no body. Online-only. */
  presence: (sessionId: string): Promise<PresenceResponse> =>
    requestJson<PresenceResponse>(`/api/code-blue/sessions/${encodeURIComponent(sessionId)}/presence`, {
      method: "PATCH",
    }),
};
