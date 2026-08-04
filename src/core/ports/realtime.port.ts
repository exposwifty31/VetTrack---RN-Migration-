/**
 * Framework-free realtime transport port (mirrors AuthSessionPort / StoragePort).
 *
 * Thin transport only: it surfaces the server SSE stream as a typed event stream
 * out. It OWNS the monotonic outbox cursor (#18 — consumers never track it) and
 * NEVER invalidates caches or terminates domain/emergency state (Operational
 * doctrine: KEEPALIVE carries activeCodeBlueSessionId but drives no domain logic;
 * Code Blue is never optimistically terminated client-side).
 *
 * CONTRACTS NOTE: the task assumed a shared realtime envelope type in
 * @vettrack/contracts to reuse — verified FALSE against source: contracts exposes
 * only `emergency` (offline-block manifest) + `pending-sync`, no realtime envelope.
 * The SSE envelope is therefore defined locally here; promoting `RealtimeEnvelope`
 * into @vettrack/contracts so web + RN share one shape is a follow-up (frozen
 * surface → separate contracts PR). `stormHint` mirrors the server enum in
 * server/lib/code-blue-keepalive.ts; the envelope is 1:1 with outboxRowToSse() in
 * server/routes/realtime.ts.
 */

export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

/** Domain event envelope — 1:1 with server outboxRowToSse() (server/routes/realtime.ts). */
export interface RealtimeEnvelope {
  type: string;
  payload: unknown;
  timestamp: string;
  /** Monotonic vt_event_outbox.id — the resume cursor. Present only on domain events. */
  id?: number;
  outboxId?: number;
  eventVersion?: number;
  level?: string;
  category?: string;
}

/** KEEPALIVE payload — mirrors server/lib/code-blue-keepalive.ts. Advisory only. */
export interface RealtimeKeepalive {
  activeCodeBlueSessionId: string | null;
  stormHint: "none" | "elevated";
}

export type RealtimeResetReason = "last_event_pruned" | "last_event_unknown";

/** Typed stream out. Exactly one kind per emission. */
export type RealtimeEvent =
  | { kind: "event"; envelope: RealtimeEnvelope }
  | { kind: "keepalive"; keepalive: RealtimeKeepalive }
  | { kind: "reset"; reason: RealtimeResetReason }
  | { kind: "state"; state: RealtimeConnectionState };

export interface RealtimePort {
  /** Open the stream (foreground). Replays from the retained cursor via Last-Event-ID. */
  open(): void;
  /** Close the stream (background). Cursor is retained across close/open. */
  close(): void;
  /** Last observed monotonic outbox cursor (0 = no resume point). Read-only; debug/telemetry. */
  getCursor(): number;
  /** Current connection state. */
  getState(): RealtimeConnectionState;
  /** Subscribe to the typed stream out. Returns an unsubscribe fn. */
  subscribe(listener: (event: RealtimeEvent) => void): () => void;
}
