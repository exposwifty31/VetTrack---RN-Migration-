/**
 * G4-6 — offline write-queue core: enqueue, FIFO replay, bounded retries,
 * circuit-breaker, permanent-failure retention, and the frozen doctrine that
 * emergency (Code Blue) mutations are NEVER queued.
 */
import { PENDING_SYNC_MAX_RETRIES } from "@vettrack/contracts";

import {
  _resetOfflineQueueForTests,
  enqueueOfflineWrite,
  getOfflineQueueSnapshot,
  replayOfflineQueue,
  subscribeOfflineQueueEvent,
  type OfflineQueueEvent,
} from "../offline-queue";

const mockMemoryStore = new Map<string, string>();

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((key: string) => mockMemoryStore.get(key) ?? null),
  safeStorageSetItem: jest.fn((key: string, value: string) => {
    mockMemoryStore.set(key, value);
    return true;
  }),
  safeStorageRemoveItem: jest.fn((key: string) => mockMemoryStore.delete(key)),
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

jest.mock("@/lib/auth-store", () => ({
  getCurrentUserId: () => "user_1",
}));

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();
const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  if (prevOrigin === undefined) {
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_API_ORIGIN = prevOrigin;
  }
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  mockMemoryStore.clear();
  mockFetch.mockReset();
  mockUuidCounter = 0;
  _resetOfflineQueueForTests();
});

const NETWORK_ERROR = () => new TypeError("Network request failed");

describe("enqueueOfflineWrite — doctrine guard", () => {
  it("refuses to enqueue an emergency (Code Blue) mutation even when called directly", () => {
    const result = enqueueOfflineWrite({
      endpoint: "/api/code-blue/sessions",
      method: "POST",
      body: JSON.stringify({ roomId: "r1" }),
    });

    expect(result).toBeNull();
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("refuses every emergency variant (start/log/end/presence)", () => {
    const cases = [
      { path: "/api/code-blue/sessions", method: "POST" },
      { path: "/api/code-blue/sessions/s-1/logs", method: "POST" },
      { path: "/api/code-blue/sessions/s-1/end", method: "PATCH" },
      { path: "/api/code-blue/sessions/s-1/presence", method: "PATCH" },
    ];
    for (const { path, method } of cases) {
      const result = enqueueOfflineWrite({ endpoint: path, method, body: "{}" });
      expect(result).toBeNull();
    }
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("refuses GET (reads are never queued)", () => {
    const result = enqueueOfflineWrite({
      endpoint: "/api/equipment",
      method: "GET",
      body: "",
    });
    expect(result).toBeNull();
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("enqueues an ordinary non-emergency domain write (equipment checkout)", () => {
    const result = enqueueOfflineWrite({
      endpoint: "/api/equipment/eq-1/checkout",
      method: "POST",
      body: JSON.stringify({ equipmentId: "eq-1" }),
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    expect(result?.retries).toBe(0);
    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      endpoint: "/api/equipment/eq-1/checkout",
      method: "POST",
      status: "pending",
    });
  });
});

describe("replayOfflineQueue — FIFO replay", () => {
  it("replays queued writes in FIFO (insertion) order and clears them on success", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/return", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replayOfflineQueue();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [firstCallUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    const [secondCallUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(firstCallUrl).toContain("/api/equipment/eq-1/checkout");
    expect(secondCallUrl).toContain("/api/equipment/eq-1/return");
    expect(getOfflineQueueSnapshot()).toHaveLength(0); // synced items are removed
  });

  it("attaches the injected bearer token to replayed requests", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replayOfflineQueue({ resolveToken: async () => "a.b.c" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer a.b.c");
  });
});

describe("replayOfflineQueue — bounded retries + permanent failure", () => {
  it("retains a dead item after exhausting retries and fires a loud permanent-failure event (never silently dropped)", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    // Each replay call is one attempt (mirrors one AppState-foreground trigger);
    // drive PENDING_SYNC_MAX_RETRIES of them to exhaust the retry budget. The
    // circuit breaker only trips on CONSECUTIVE failures within a single pass
    // (one item here), so it never blocks these sequential passes.
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replayOfflineQueue();
    }

    unsubscribe();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1); // retained, not dropped
    expect(snapshot[0].status).toBe("dead");
    expect(snapshot[0].retries).toBe(PENDING_SYNC_MAX_RETRIES);

    const permanentFailures = events.filter((e) => e.kind === "item_permanent_failure");
    expect(permanentFailures).toHaveLength(1);
  });

  it("does not retry a dead item on a subsequent replay pass", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replayOfflineQueue();
    }
    mockFetch.mockClear();

    await replayOfflineQueue();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("replayOfflineQueue — server-response outcomes", () => {
  it("a 401 during replay is treated as RECOVERABLE (retried, not marked dead on first attempt)", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await replayOfflineQueue();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("pending"); // NOT dead — the token may just be stale/not-yet-installed
    expect(snapshot[0].retries).toBe(1);
  });

  it("a 401 that later succeeds (token becomes valid) syncs and clears the item", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await replayOfflineQueue(); // cold-start race: no token yet

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await replayOfflineQueue(); // auth "ready" fires — retried with a valid token

    expect(getOfflineQueueSnapshot()).toHaveLength(0); // synced, not lost
  });

  it("a 401 is eventually terminal after exhausting the retry budget (still not silently dropped)", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replayOfflineQueue();
    }

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("dead");
  });

  it("a genuine 4xx client error (e.g. 422 validation) is terminal on the FIRST attempt (never retried)", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: false, status: 422 });

    await replayOfflineQueue();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("dead");
    expect(snapshot[0].retries).toBe(0); // dead on attempt 1, not via the retry budget
  });

  it("a 409 conflict is terminal but tagged 'conflict', distinct from 'dead'", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockResolvedValue({ ok: false, status: 409 });

    await replayOfflineQueue();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("conflict");
  });
});

describe("replayOfflineQueue — circuit breaker", () => {
  it("opens the circuit after consecutive transient failures within one pass, leaving remaining items pending", async () => {
    for (let i = 0; i < 5; i++) {
      enqueueOfflineWrite({ endpoint: `/api/equipment/eq-${i}/checkout`, method: "POST", body: "{}" });
    }
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    await replayOfflineQueue();
    unsubscribe();

    // The breaker trips before all 5 items are attempted.
    expect(mockFetch.mock.calls.length).toBeLessThan(5);
    expect(events.some((e) => e.kind === "circuit_open")).toBe(true);
    // Untried items remain pending (still in the queue, not lost).
    const stillPending = getOfflineQueueSnapshot().filter((i) => i.status === "pending");
    expect(stillPending.length).toBeGreaterThan(0);
  });

  it("refuses to replay again while the circuit cooldown is active, then resumes after it expires", async () => {
    for (let i = 0; i < 5; i++) {
      enqueueOfflineWrite({ endpoint: `/api/equipment/eq-${i}/checkout`, method: "POST", body: "{}" });
    }
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    await replayOfflineQueue(); // trips the breaker
    const callsAfterFirstPass = mockFetch.mock.calls.length;

    await replayOfflineQueue(); // cooldown still active — must no-op
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirstPass);

    jest.useFakeTimers().setSystemTime(Date.now() + 60_000); // past any reasonable cooldown
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await replayOfflineQueue();
    jest.useRealTimers();

    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterFirstPass);
  });
});

describe("dead-letter retention", () => {
  it("keeps a dead item across getOfflineQueueSnapshot calls (not purged immediately)", async () => {
    enqueueOfflineWrite({ endpoint: "/api/equipment/eq-1/checkout", method: "POST", body: "{}" });
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replayOfflineQueue();
    }

    expect(getOfflineQueueSnapshot().find((i) => i.status === "dead")).toBeDefined();
  });
});
