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

function makeAdapter(token: string | null = "a.b.c") {
  const instances: FakeEventSource[] = [];
  const factory: SseFactory = (url, options) => {
    const es = new FakeEventSource(url, options);
    instances.push(es);
    return es;
  };
  const adapter = new SseAdapter({
    factory,
    resolveUrl: (p) => `http://x${p}`,
    resolveToken: async () => token,
    isValidToken: (t) => !!t && t.split(".").length === 3,
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
});
