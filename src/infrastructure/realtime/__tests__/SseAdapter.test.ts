import type { RealtimeEvent } from "@/core/ports/realtime.port";

import {
  SseAdapter,
  type SseFactory,
  type SseIncoming,
  type SseLike,
} from "../SseAdapter";

type Listener = (event: SseIncoming) => void;

class FakeEventSource implements SseLike {
  handlers = new Map<string, Listener[]>();
  closed = false;
  removedAll = false;

  constructor(
    public url: string,
    public options: { headers: Record<string, string>; pollingInterval: number },
  ) {}

  addEventListener(type: string, listener: Listener): void {
    const arr = this.handlers.get(type) ?? [];
    arr.push(listener);
    this.handlers.set(type, arr);
  }

  removeAllEventListeners(): void {
    this.removedAll = true;
    this.handlers.clear();
  }

  close(): void {
    this.closed = true;
  }

  fire(type: string, event: SseIncoming): void {
    for (const l of this.handlers.get(type) ?? []) l(event);
  }
}

function makeAdapter(
  token: string | null = "a.b.c",
  overrides: { resolveUrl?: (p: string) => string; allowInsecureAuth?: boolean } = {},
) {
  const instances: FakeEventSource[] = [];
  const factory: SseFactory = (url, options) => {
    const es = new FakeEventSource(url, options);
    instances.push(es);
    return es;
  };
  const adapter = new SseAdapter({
    factory,
    resolveUrl: overrides.resolveUrl ?? ((p) => `https://x${p}`),
    resolveToken: async () => token,
    isValidToken: (t) => !!t && t.split(".").length === 3,
    allowInsecureAuth: overrides.allowInsecureAuth,
  });
  return { adapter, instances };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function msg(envelope: Record<string, unknown>): SseIncoming {
  return { type: "message", data: JSON.stringify(envelope) };
}

describe("SseAdapter", () => {
  it("opens with Bearer + no Last-Event-ID when cursor is 0, pollingInterval 0", async () => {
    const { adapter, instances } = makeAdapter();
    adapter.open();
    await flush();
    expect(instances).toHaveLength(1);
    expect(instances[0].options.headers.Authorization).toBe("Bearer a.b.c");
    expect(instances[0].options.headers["Last-Event-ID"]).toBeUndefined();
    expect(instances[0].options.pollingInterval).toBe(0);
  });

  it("advances cursor on domain events and replays via Last-Event-ID on reopen", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    instances[0].fire("open", { type: "open" });
    instances[0].fire(
      "message",
      msg({ type: "EQUIPMENT_UPDATED", payload: {}, timestamp: "t", id: 42, outboxId: 42 }),
    );
    expect(adapter.getCursor()).toBe(42);
    expect(events).toContainEqual({
      kind: "event",
      envelope: expect.objectContaining({ id: 42 }),
    });

    adapter.close();
    adapter.open();
    await flush();
    expect(instances).toHaveLength(2);
    expect(instances[1].options.headers["Last-Event-ID"]).toBe("42");
  });

  it("KEEPALIVE does not advance the cursor", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    instances[0].fire(
      "message",
      msg({
        type: "KEEPALIVE",
        payload: { activeCodeBlueSessionId: "cb1", stormHint: "elevated" },
        timestamp: "t",
      }),
    );
    expect(adapter.getCursor()).toBe(0);
    expect(events).toContainEqual({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "elevated" },
    });
  });

  it("reset_state:last_event_pruned drops cursor to 0 and signals resync", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    instances[0].fire(
      "message",
      msg({ type: "EQUIPMENT_UPDATED", payload: {}, timestamp: "t", id: 10, outboxId: 10 }),
    );
    expect(adapter.getCursor()).toBe(10);
    instances[0].fire(
      "message",
      msg({ type: "RESET_STATE", payload: { reason: "last_event_pruned" }, timestamp: "t" }),
    );
    expect(adapter.getCursor()).toBe(0);
    expect(events).toContainEqual({ kind: "reset", reason: "last_event_pruned" });
  });

  it("reopening after a reset sends NO Last-Event-ID (G4-4: this is what makes a reset " +
    "storm structurally unreachable — the pruned-cursor branch on the server only " +
    "fires when a Last-Event-ID header is present)", async () => {
    const { adapter, instances } = makeAdapter();
    adapter.open();
    await flush();
    instances[0].fire(
      "message",
      msg({ type: "EQUIPMENT_UPDATED", payload: {}, timestamp: "t", id: 10, outboxId: 10 }),
    );
    instances[0].fire(
      "message",
      msg({ type: "RESET_STATE", payload: { reason: "last_event_pruned" }, timestamp: "t" }),
    );
    adapter.close();
    adapter.open();
    await flush();
    expect(instances[1].options.headers["Last-Event-ID"]).toBeUndefined();
  });

  it("tears down the previous EventSource on reopen — no stale callbacks", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    const first = instances[0];
    first.fire("error", { type: "error" });
    adapter.close();
    adapter.open();
    await flush();
    const before = events.length;
    // Stale instance was removeAllEventListeners()'d + generation-guarded — a late
    // frame must not mutate state or advance the cursor.
    first.fire("message", msg({ type: "X", payload: {}, timestamp: "t", id: 99 }));
    expect(events.length).toBe(before);
    expect(first.removedAll).toBe(true);
    expect(first.closed).toBe(true);
    expect(adapter.getCursor()).toBe(0);
  });

  it("emits error state and builds no EventSource on an invalid token", async () => {
    const { adapter, instances } = makeAdapter(null);
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    expect(instances).toHaveLength(0);
    expect(adapter.getState()).toBe("error");
    expect(events).toContainEqual({ kind: "state", state: "error" });
  });

  it("refuses to attach the Bearer over cleartext http:// (CWE-319)", async () => {
    const { adapter, instances } = makeAdapter("a.b.c", {
      resolveUrl: (p) => `http://insecure${p}`,
    });
    adapter.open();
    await flush();
    expect(instances).toHaveLength(0); // token never reached EventSource
    expect(adapter.getState()).toBe("error");
  });

  it("permits http:// only when allowInsecureAuth is set (dev on-device)", async () => {
    const { adapter, instances } = makeAdapter("a.b.c", {
      resolveUrl: (p) => `http://192.168.1.5:3001${p}`,
      allowInsecureAuth: true,
    });
    adapter.open();
    await flush();
    expect(instances).toHaveLength(1);
    expect(instances[0].options.headers.Authorization).toBe("Bearer a.b.c");
  });

  it("drops valid-JSON frames that are not envelope objects (null/array/primitive)", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    const before = events.length;
    for (const data of ["null", "42", '"str"', "[1,2,3]", "{}"]) {
      instances[0].fire("message", { type: "message", data });
    }
    expect(events.length).toBe(before); // nothing emitted, nothing thrown
    expect(adapter.getCursor()).toBe(0);
  });

  it("ignores an SSE retry: control-line payload without dispatching a domain event or breaking subsequent parsing", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    const before = events.length;

    // Worst case for a naive line parser: a bare `retry:` control-line value
    // reaches onMessage as `data` (react-native-sse never does this — it strips
    // `retry:` before dispatch, see node_modules/react-native-sse/src/EventSource.js
    // `_handleEvent`, which only calls `dispatch('message', ...)` when the parsed
    // `data` array is non-empty — but this adapter must stay safe even if a future
    // library version or a misbehaving factory ever forwarded it).
    instances[0].fire("message", { type: "message", data: "retry: 3000" });
    expect(events.length).toBe(before); // not mis-dispatched as a domain event
    expect(adapter.getCursor()).toBe(0); // not mistaken for a numeric cursor

    // Parsing must not be left broken for the next real frame.
    instances[0].fire(
      "message",
      msg({ type: "EQUIPMENT_UPDATED", payload: {}, timestamp: "t", id: 7, outboxId: 7 }),
    );
    expect(adapter.getCursor()).toBe(7);
    expect(events).toContainEqual({
      kind: "event",
      envelope: expect.objectContaining({ id: 7 }),
    });
  });

  it("maps an unknown RESET_STATE reason to last_event_unknown", async () => {
    const { adapter, instances } = makeAdapter();
    const events: RealtimeEvent[] = [];
    adapter.subscribe((e) => events.push(e));
    adapter.open();
    await flush();
    instances[0].fire(
      "message",
      msg({ type: "RESET_STATE", payload: { reason: "bogus_reason" }, timestamp: "t" }),
    );
    expect(events).toContainEqual({ kind: "reset", reason: "last_event_unknown" });
  });
});

describe("SseAdapter auth-rejected latch (stale-session hammering fix)", () => {
  function makeMutableTokenAdapter() {
    const instances: FakeEventSource[] = [];
    const factory: SseFactory = (url, options) => {
      const es = new FakeEventSource(url, options);
      instances.push(es);
      return es;
    };
    const tokenBox = { value: "a.b.c" };
    const adapter = new SseAdapter({
      factory,
      resolveUrl: (p) => `https://x${p}`,
      resolveToken: async () => tokenBox.value,
      isValidToken: (t) => !!t && t.split(".").length === 3,
    });
    return { adapter, instances, tokenBox };
  }

  it("does NOT build a new connection for the SAME token after a 401/403-rejected stream", async () => {
    const { adapter, instances } = makeMutableTokenAdapter();
    adapter.open();
    await flush();
    expect(instances).toHaveLength(1);
    instances[0].fire("error", { type: "error", xhrStatus: 403 });
    expect(adapter.getState()).toBe("error");

    adapter.open(); // e.g. an AppState flap or an auth "ready" re-fire with the same dead token
    await flush();

    expect(instances).toHaveLength(1); // no second EventSource — the hammering is gone
    expect(adapter.getState()).toBe("error");
  });

  it("reconnects once the token CHANGES (real sign-in replaces the dead session)", async () => {
    const { adapter, instances, tokenBox } = makeMutableTokenAdapter();
    adapter.open();
    await flush();
    instances[0].fire("error", { type: "error", xhrStatus: 401 });

    tokenBox.value = "d.e.f";
    adapter.open();
    await flush();

    expect(instances).toHaveLength(2);
    expect(instances[1].options.headers.Authorization).toBe("Bearer d.e.f");
  });

  it("keeps the old behavior for a NON-auth error (no xhrStatus) — next open() reconnects", async () => {
    const { adapter, instances } = makeMutableTokenAdapter();
    adapter.open();
    await flush();
    instances[0].fire("error", { type: "error" }); // network drop — transient, retry is fine

    adapter.open();
    await flush();

    expect(instances).toHaveLength(2);
  });
});
