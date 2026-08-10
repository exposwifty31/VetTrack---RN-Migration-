/**
 * G4-6 — offline write-queue core: enqueue, FIFO replay, bounded retries,
 * circuit-breaker, permanent-failure retention, and the frozen doctrine that
 * emergency (Code Blue) mutations are NEVER queued.
 *
 * CodeRabbit PR #51 additions: cross-user replay isolation (the shared-device
 * security bug — a queued item must never be replayed under a different
 * signed-in identity), idempotency-key preservation across replay, and
 * item_permanent_failure firing for terminal 4xx (client_error), not just
 * exhausted-retries (dead).
 */
import { PENDING_SYNC_MAX_RETRIES, type PendingSync } from "@vettrack/contracts";

import {
  _resetOfflineQueueForTests,
  enqueueOfflineWrite,
  getOfflineQueueSnapshot,
  replayOfflineQueue,
  subscribeOfflineQueueEvent,
  type EnqueueOfflineWriteInput,
  type OfflineQueueEvent,
  type ReplayDeps,
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

const USER_A = "user-a";
const USER_B = "user-b";

/** Test default: every write is issued by USER_A unless overridden — matches real
 * usage where `userId` is captured from the authenticated identity BEFORE dispatch. */
function enqueue(overrides: Partial<EnqueueOfflineWriteInput> = {}): PendingSync | null {
  return enqueueOfflineWrite({
    endpoint: "/api/equipment/eq-1/checkout",
    method: "POST",
    body: "{}",
    userId: USER_A,
    ...overrides,
  });
}

/** Test default: replay runs as USER_A unless overridden. */
function replay(deps: ReplayDeps = {}): Promise<void> {
  return replayOfflineQueue({ getCurrentUserId: () => USER_A, ...deps });
}

describe("enqueueOfflineWrite — doctrine guard", () => {
  it("refuses to enqueue an emergency (Code Blue) mutation even when called directly", () => {
    const result = enqueue({ endpoint: "/api/code-blue/sessions" });

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
      const result = enqueue({ endpoint: path, method });
      expect(result).toBeNull();
    }
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("refuses GET (reads are never queued)", () => {
    const result = enqueue({ endpoint: "/api/equipment", method: "GET", body: "" });
    expect(result).toBeNull();
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("enqueues an ordinary non-emergency domain write (equipment checkout)", () => {
    const result = enqueue({ body: JSON.stringify({ equipmentId: "eq-1" }) });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    expect(result?.retries).toBe(0);
    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      endpoint: "/api/equipment/eq-1/checkout",
      method: "POST",
      status: "pending",
      userId: USER_A,
    });
  });

  it("preserves a caller-supplied idempotency key instead of always minting a fresh one (CodeRabbit PR #51)", () => {
    const result = enqueue({ idempotencyKey: "caller-supplied-key-123" });

    expect(result?.idempotencyKey).toBe("caller-supplied-key-123");
  });

  it("mints a fresh idempotency key only when the caller did not supply one", () => {
    const result = enqueue({});
    expect(result?.idempotencyKey).toBe("uuid-2"); // uuid-1 is clientMutationId
  });
});

describe("replayOfflineQueue — FIFO replay", () => {
  it("replays queued writes in FIFO (insertion) order and clears them on success", async () => {
    enqueue({ endpoint: "/api/equipment/eq-1/checkout" });
    enqueue({ endpoint: "/api/equipment/eq-1/return" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [firstCallUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    const [secondCallUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(firstCallUrl).toContain("/api/equipment/eq-1/checkout");
    expect(secondCallUrl).toContain("/api/equipment/eq-1/return");
    expect(getOfflineQueueSnapshot()).toHaveLength(0); // synced items are removed
  });

  it("attaches the injected bearer token to replayed requests", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay({ resolveToken: async () => "a.b.c" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer a.b.c");
  });

  it("preserves the original idempotency key on the replayed request's header (never regenerated)", async () => {
    enqueue({ idempotencyKey: "original-key" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("original-key");
  });
});

describe("replayOfflineQueue — cross-user isolation (CodeRabbit PR #51 security gate)", () => {
  it("NEVER replays user A's queued write while user B is the active identity (shared-device gate)", async () => {
    enqueue({ userId: USER_A });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay({ getCurrentUserId: () => USER_B, resolveToken: async () => "b-token" });

    expect(mockFetch).not.toHaveBeenCalled(); // B's bearer token must never touch A's write
    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("pending"); // held, not dropped and not dead-lettered
    expect(snapshot[0].userId).toBe(USER_A); // ownership is untouched
  });

  it("emits an observable owner-mismatch event instead of silently skipping (loud, not silent)", async () => {
    enqueue({ userId: USER_A });
    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    await replay({ getCurrentUserId: () => USER_B });
    unsubscribe();

    expect(events.some((e) => e.kind === "item_owner_mismatch")).toBe(true);
  });

  it("replays normally once the owning user is active again (hold-until-owner-returns policy)", async () => {
    enqueue({ userId: USER_A });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay({ getCurrentUserId: () => USER_B }); // B signed in — held
    expect(mockFetch).not.toHaveBeenCalled();

    await replay({ getCurrentUserId: () => USER_A }); // A signed back in — replays
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("does not cross-contaminate a mixed queue: only the active user's items replay, others stay held", async () => {
    enqueue({ userId: USER_A, endpoint: "/api/equipment/eq-a/checkout" });
    enqueue({ userId: USER_B, endpoint: "/api/equipment/eq-b/checkout" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay({ getCurrentUserId: () => USER_A });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/equipment/eq-a/checkout");
    const remaining = getOfflineQueueSnapshot();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(USER_B);
    expect(remaining[0].status).toBe("pending");
  });

  it("an identity change MID-PASS stops binding further items to the old identity, from the next item onward (effective 'abort')", async () => {
    // getCurrentUserId is called FRESH per item (see offline-queue.ts doc) —
    // simulating a sign-out/account-switch that happens WHILE a multi-item
    // replay pass is already running, without needing to cancel the pass.
    enqueue({ userId: USER_A, endpoint: "/api/equipment/eq-1/checkout" });
    enqueue({ userId: USER_A, endpoint: "/api/equipment/eq-2/checkout" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    let calls = 0;
    const flippingGetCurrentUserId = () => {
      calls++;
      return calls === 1 ? USER_A : USER_B; // flips identity after the first item
    };

    await replay({ getCurrentUserId: flippingGetCurrentUserId });

    expect(mockFetch).toHaveBeenCalledTimes(1); // only the first item, issued as A
    const remaining = getOfflineQueueSnapshot();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].endpoint).toBe("/api/equipment/eq-2/checkout"); // held once identity flips
    expect(remaining[0].status).toBe("pending");
  });

  it("a legacy/ownerless item (no userId) is NEVER auto-replayed under any identity (fail-closed policy)", async () => {
    enqueue({ userId: undefined });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replay({ getCurrentUserId: () => USER_A });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(getOfflineQueueSnapshot()).toHaveLength(1); // retained, not dropped — awaits a deliberate migration decision
  });

  it("without a getCurrentUserId dependency wired at all, replay holds every owned item (fail-closed default)", async () => {
    enqueue({ userId: USER_A });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await replayOfflineQueue({}); // no getCurrentUserId — the OfflineQueueBridge always wires one in production

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("replayOfflineQueue — bounded retries + permanent failure", () => {
  it("retains a dead item after exhausting retries and fires a loud permanent-failure event (never silently dropped)", async () => {
    enqueue({});
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    // Each replay call is one attempt (mirrors one AppState-foreground trigger);
    // drive PENDING_SYNC_MAX_RETRIES of them to exhaust the retry budget. The
    // circuit breaker only trips on CONSECUTIVE failures within a single pass
    // (one item here), so it never blocks these sequential passes.
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replay();
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
    enqueue({});
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replay();
    }
    mockFetch.mockClear();

    await replay();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("replayOfflineQueue — server-response outcomes", () => {
  it("a 401 during replay is treated as RECOVERABLE (retried, not marked dead on first attempt)", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await replay();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("pending"); // NOT dead — the token may just be stale/not-yet-installed
    expect(snapshot[0].retries).toBe(1);
  });

  it("a 401 that later succeeds (token becomes valid) syncs and clears the item, verified via the refreshed Authorization header", async () => {
    enqueue({});
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await replay({ resolveToken: async () => "stale-or-missing-token" }); // cold-start race: no valid token yet

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await replay({ resolveToken: async () => "fresh-token" }); // auth "ready" fires — retried with a valid token

    expect(getOfflineQueueSnapshot()).toHaveLength(0); // synced, not lost
    const [, secondInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    const secondHeaders = secondInit.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe("Bearer fresh-token"); // actually verifies the token-recovery path
  });

  it("a 401 is eventually terminal after exhausting the retry budget (still not silently dropped)", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replay();
    }

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("dead");
  });

  it("a genuine 4xx client error (e.g. 422 validation) is terminal on the FIRST attempt (never retried)", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: false, status: 422 });

    await replay();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("dead");
    expect(snapshot[0].retries).toBe(0); // dead on attempt 1, not via the retry budget
  });

  it("emits item_permanent_failure for a terminal 4xx client_error, not just exhausted-retries dead (CodeRabbit PR #51)", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: false, status: 422 });
    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    await replay();
    unsubscribe();

    const permanentFailures = events.filter((e) => e.kind === "item_permanent_failure");
    expect(permanentFailures).toHaveLength(1);
  });

  it("a 409 conflict is terminal but tagged 'conflict', distinct from 'dead', and does NOT emit item_permanent_failure", async () => {
    enqueue({});
    mockFetch.mockResolvedValue({ ok: false, status: 409 });
    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    await replay();
    unsubscribe();

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBe("conflict");
    expect(events.some((e) => e.kind === "item_permanent_failure")).toBe(false);
  });
});

describe("replayOfflineQueue — circuit breaker", () => {
  it("opens the circuit after consecutive transient failures within one pass, leaving remaining items pending", async () => {
    for (let i = 0; i < 5; i++) {
      enqueue({ endpoint: `/api/equipment/eq-${i}/checkout` });
    }
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const events: OfflineQueueEvent[] = [];
    const unsubscribe = subscribeOfflineQueueEvent((e) => events.push(e));

    await replay();
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
      enqueue({ endpoint: `/api/equipment/eq-${i}/checkout` });
    }
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    await replay(); // trips the breaker
    const callsAfterFirstPass = mockFetch.mock.calls.length;

    await replay(); // cooldown still active — must no-op
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirstPass);

    jest.useFakeTimers().setSystemTime(Date.now() + 60_000); // past any reasonable cooldown
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await replay();
    jest.useRealTimers();

    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterFirstPass);
  });
});

describe("dead-letter retention", () => {
  it("keeps a dead item across getOfflineQueueSnapshot calls (not purged immediately)", async () => {
    enqueue({});
    mockFetch.mockRejectedValue(NETWORK_ERROR());
    for (let i = 0; i < PENDING_SYNC_MAX_RETRIES; i++) {
      await replay();
    }

    expect(getOfflineQueueSnapshot().find((i) => i.status === "dead")).toBeDefined();
  });
});
