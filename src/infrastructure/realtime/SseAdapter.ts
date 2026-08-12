import type {
  RealtimeConnectionState,
  RealtimeEnvelope,
  RealtimeEvent,
  RealtimeKeepalive,
  RealtimePort,
  RealtimeResetReason,
} from "@/core/ports/realtime.port";

/** Minimal EventSource surface used by the adapter (react-native-sse implements this). */
export interface SseLike {
  addEventListener(type: string, listener: (event: SseIncoming) => void): void;
  removeAllEventListeners(): void;
  close(): void;
}

/** Shape of the events react-native-sse hands us (message/open/error/close). */
export interface SseIncoming {
  type: string;
  data?: string | null;
  lastEventId?: string | null;
  message?: string;
  xhrStatus?: number;
}

export interface SseFactoryOptions {
  headers: Record<string, string>;
  method: "GET";
  /**
   * 0 disables react-native-sse's built-in auto-reconnect — AppState drives lifecycle.
   * LATENT COUPLING (verdict note): the library re-enables auto-reconnect if the stream
   * ever emits an SSE `retry:` line (it sets this.interval = retry, which makes its
   * _pollAgain(interval, false) guard pass). The vettrack server emits only id/data
   * lines today (outboxRowToSse / startKeepalive / resetStateSse), so pollingInterval:0
   * stays effective and this transport is exactly one AppState-driven SSE connection.
   * If a future server change adds `retry:`, that "one connection" invariant would break.
   */
  pollingInterval: number;
  debug?: boolean;
}

export type SseFactory = (url: string, options: SseFactoryOptions) => SseLike;

export interface SseAdapterDeps {
  /** Constructs an EventSource-like object. Injected so tests drive it without a socket. */
  factory: SseFactory;
  /** resolveApiUrl from @/lib/api-origin. */
  resolveUrl: (path: string) => string;
  /** resolveBearerToken from @/lib/auth-fetch. */
  resolveToken: () => Promise<string | null>;
  /** isValidJwt from @/lib/auth-fetch. */
  isValidToken: (token: string | null) => boolean;
  /**
   * Permit attaching the Bearer token to a non-https:// stream URL. Defaults to
   * false (secure): a cleartext http:// stream is refused so the token is never
   * transmitted in the clear (CWE-319). Production wires this false; dev sets it
   * true so on-device Expo over http://<LAN-IP> still connects.
   */
  allowInsecureAuth?: boolean;
  /** Override for tests; defaults to the frozen SSE stream path. */
  streamPath?: string;
  debug?: boolean;
}

const DEFAULT_STREAM_PATH = "/api/realtime/stream";

const VALID_RESET_REASONS: readonly RealtimeResetReason[] = [
  "last_event_pruned",
  "last_event_unknown",
];

function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/** True only for a genuine RealtimeEnvelope object shape (rejects null/array/primitive). */
function isEnvelopeShape(value: unknown): value is RealtimeEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function toNumericCursor(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

/**
 * SSE transport over react-native-sse.
 *
 * - Recreates the EventSource on every open() so each foreground connect carries a
 *   FRESH Bearer token (Clerk tokens are short-lived) + an explicit Last-Event-ID
 *   from the adapter-owned cursor. pollingInterval:0 disables the library's own
 *   reconnect — foreground/background is the only lifecycle driver.
 * - Cursor advances ONLY on domain events carrying a numeric outbox id. KEEPALIVE
 *   and RESET_STATE never advance it (they carry no `id:` line server-side).
 * - reset_state (last_event_pruned/unknown) → emit a typed reset signal AND drop
 *   the cursor to 0 (no valid resume point). NOTE: cursor=0 means the next connect
 *   sends no Last-Event-ID, so the server replays nothing and downstream must
 *   full-snapshot resync + rebaseline the cursor — that is the DEFERRED consumer
 *   responsibility of a later slice, not a data-loss bug. The reset signal firing
 *   is what satisfies "do not silently drop".
 * - A monotonic `generation` guard + teardown-before-reopen prevents a stale
 *   (post-close) EventSource callback from mutating state or advancing the cursor.
 */
export class SseAdapter implements RealtimePort {
  private readonly deps: SseAdapterDeps;
  private readonly listeners = new Set<(event: RealtimeEvent) => void>();
  private es: SseLike | null = null;
  private cursor = 0;
  private state: RealtimeConnectionState = "idle";
  private generation = 0;
  /** Token of the CURRENT (or most recent) connection attempt. */
  private lastToken: string | null = null;
  /**
   * Auth-rejected latch (physical-device finding, 2026-08-12): a stream the server
   * rejected with 401/403 means the TOKEN is dead, not the network. Every external
   * open() driver (AppState flaps, auth "ready" re-fires) would otherwise rebuild
   * the connection ~2×/s forever against the same dead session. open() refuses to
   * reconnect while resolveToken() still returns this exact token; a genuinely new
   * token (sign-in, Clerk refresh) clears the latch by simply not matching.
   */
  private authRejectedToken: string | null = null;

  constructor(deps: SseAdapterDeps) {
    this.deps = deps;
  }

  getCursor(): number {
    return this.cursor;
  }

  getState(): RealtimeConnectionState {
    return this.state;
  }

  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  open(): void {
    if (this.state === "connecting" || this.state === "open") return;
    // Tear down any prior instance FIRST so its XHR callbacks can't fire stale.
    this.teardown();
    const gen = ++this.generation;
    this.setState("connecting");

    void this.deps
      .resolveToken()
      .then((token) => {
        if (gen !== this.generation) return; // superseded by a newer open()/close()
        if (!this.deps.isValidToken(token)) {
          this.setState("error");
          return;
        }
        if (this.authRejectedToken !== null && token === this.authRejectedToken) {
          // The server already rejected this exact token (401/403) — reconnecting
          // with it can only fail again. Stay in error until the token changes.
          this.setState("error");
          return;
        }
        this.lastToken = token;
        const url = this.deps.resolveUrl(this.deps.streamPath ?? DEFAULT_STREAM_PATH);
        // Never send the Bearer token over cleartext http:// (CWE-319). Refuse the
        // connect before EventSource ever sees the Authorization header. Dev opts
        // out via allowInsecureAuth so on-device Expo (http://<LAN-IP>) still works.
        if (!isHttpsUrl(url) && !this.deps.allowInsecureAuth) {
          this.setState("error");
          return;
        }
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (this.cursor > 0) {
          headers["Last-Event-ID"] = String(this.cursor);
        }
        const es = this.deps.factory(url, {
          headers,
          method: "GET",
          pollingInterval: 0,
          debug: this.deps.debug,
        });
        this.attach(es, gen);
        this.es = es;
      })
      .catch(() => {
        if (gen !== this.generation) return;
        this.setState("error");
      });
  }

  close(): void {
    this.generation++; // invalidate any in-flight open() token resolution
    this.teardown();
    this.setState("closed");
  }

  private attach(es: SseLike, gen: number): void {
    const guard =
      (fn: (event: SseIncoming) => void) =>
      (event: SseIncoming): void => {
        if (gen !== this.generation) return;
        fn(event);
      };

    es.addEventListener("open", guard(() => this.setState("open")));
    es.addEventListener("message", guard((event) => this.onMessage(event)));
    es.addEventListener(
      "error",
      guard((event) => {
        // react-native-sse surfaces the HTTP status of a rejected stream on the
        // error event. 401/403 = the token is dead → arm the latch (see field doc).
        if (event.xhrStatus === 401 || event.xhrStatus === 403) {
          this.authRejectedToken = this.lastToken;
        }
        this.setState("error");
      }),
    );
    es.addEventListener("close", guard(() => this.setState("closed")));
  }

  private onMessage(event: SseIncoming): void {
    if (!event.data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return; // malformed frame — drop defensively, never throw on the transport
    }
    // JSON.parse accepts bare null/number/string/array — validate the envelope
    // shape before any property access so a non-object frame can't throw or emit.
    if (!isEnvelopeShape(parsed)) return;
    const envelope = parsed;

    if (envelope.type === "KEEPALIVE") {
      const payload = (envelope.payload ?? {}) as Partial<RealtimeKeepalive>;
      this.emit({
        kind: "keepalive",
        keepalive: {
          activeCodeBlueSessionId:
            typeof payload.activeCodeBlueSessionId === "string"
              ? payload.activeCodeBlueSessionId
              : null,
          stormHint: payload.stormHint === "elevated" ? "elevated" : "none",
        },
      });
      return; // never advances cursor, never invalidates caches (doctrine)
    }

    if (envelope.type === "RESET_STATE") {
      // Validate the server-provided reason against the known set at runtime —
      // never let an arbitrary string escape as a RealtimeResetReason.
      const rawReason = (envelope.payload as { reason?: unknown } | undefined)?.reason;
      const reason: RealtimeResetReason = VALID_RESET_REASONS.includes(
        rawReason as RealtimeResetReason,
      )
        ? (rawReason as RealtimeResetReason)
        : "last_event_unknown";
      this.cursor = 0; // pruned/unknown resume point — force full snapshot downstream
      this.emit({ kind: "reset", reason });
      return;
    }

    const nextCursor = toNumericCursor(envelope.outboxId) ?? toNumericCursor(envelope.id);
    if (nextCursor !== undefined && nextCursor > this.cursor) {
      this.cursor = nextCursor;
    }
    this.emit({ kind: "event", envelope });
  }

  private teardown(): void {
    if (this.es) {
      try {
        this.es.removeAllEventListeners();
        this.es.close();
      } catch {
        // Ignore teardown races — best effort.
      }
      this.es = null;
    }
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ kind: "state", state });
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
