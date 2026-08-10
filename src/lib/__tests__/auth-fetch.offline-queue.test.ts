/**
 * G4-6 — fetch-layer wiring of the offline write-queue.
 *
 * Doctrine under test: offline + non-emergency mutation is captured for
 * later replay as a pure SIDE EFFECT — the caller still sees the original
 * network error unchanged (byte-identical to the G4-5 assertion in
 * `auth-fetch.emergency.test.ts`; this slice does not add optimistic
 * success). Offline + emergency mutation must never reach the queue at all
 * (asserted at the integration level here, complementing the unit-level
 * refusal test in `offline-queue.test.ts`).
 */
import { authFetch } from "../auth-fetch";
import { setCurrentUserId, setStoredBearerToken } from "../auth-store";
import { _clearEmergencyBlockBufferForTests, EmergencyOfflineError } from "../emergency-block";
import { _resetOfflineQueueForTests, getOfflineQueueSnapshot } from "../offline-queue/offline-queue";

const mockMemoryStore = new Map<string, string>();

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((key: string) => mockMemoryStore.get(key) ?? null),
  safeStorageSetItem: jest.fn((key: string, value: string) => {
    mockMemoryStore.set(key, value);
    return true;
  }),
  safeStorageRemoveItem: jest.fn((key: string) => mockMemoryStore.delete(key)),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${Math.random()}`,
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
  setStoredBearerToken("a.b.c");
  setCurrentUserId("user_1");
  mockMemoryStore.clear();
  _resetOfflineQueueForTests();
});

afterEach(() => {
  mockFetch.mockReset();
  setStoredBearerToken(null);
  setCurrentUserId(null);
  _clearEmergencyBlockBufferForTests();
});

const NETWORK_ERROR = () => new TypeError("Network request failed");

describe("authFetch offline-queue wiring", () => {
  it("offline + non-emergency mutation: enqueues AND the original network error still propagates unchanged", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);

    const err = await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: JSON.stringify({ equipmentId: "eq-1" }),
    }).catch((e: unknown) => e);

    expect(err).toBe(original); // byte-identical to the G4-5 contract — no optimistic success
    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      endpoint: "/api/equipment/eq-1/checkout",
      method: "POST",
      status: "pending",
      userId: "user_1", // identity captured before dispatch is stamped on the queued item
    });
  });

  it("CodeRabbit PR #51 security fix: an identity change DURING the in-flight request does not relabel the queued item's owner", async () => {
    // Simulates the exact race the finding describes: the request was dispatched
    // as user_1, but by the time the network failure is observed (this fetch's
    // rejection), the app has already moved to a different identity (e.g. a fast
    // sign-out/switch). The enqueued item must still be stamped "user_1" — the
    // identity captured BEFORE dispatch — never re-derived from "whatever is
    // current now" at catch-time.
    mockFetch.mockImplementation(() => {
      setCurrentUserId("user_2");
      return Promise.reject(NETWORK_ERROR());
    });

    await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: "{}",
    }).catch(() => {});

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].userId).toBe("user_1"); // NOT "user_2"
  });

  it("preserves a caller-supplied Idempotency-Key header verbatim across enqueue (CodeRabbit PR #51 — duplicate-mutation guard)", async () => {
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    await authFetch("/api/containers/c-1/dispense", {
      method: "POST",
      body: "{}",
      headers: { "Idempotency-Key": "caller-minted-key-abc" },
    }).catch(() => {});

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].idempotencyKey).toBe("caller-minted-key-abc");
  });

  it("CodeRabbit PR #51 major finding: a FormData body is NEVER enqueued as an empty-body mutation (no durable codec yet)", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);
    const form = new FormData();
    form.append("file", "not-a-real-file");

    const err = await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: form,
    }).catch((e: unknown) => e);

    expect(err).toBe(original); // original network error still propagates unchanged
    expect(getOfflineQueueSnapshot()).toHaveLength(0); // never queued — not silently corrupted to ""
  });

  it("CodeRabbit PR #51 major finding: a URLSearchParams body is NEVER enqueued as an empty-body mutation", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);
    const params = new URLSearchParams({ foo: "bar" });

    const err = await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: params,
    }).catch((e: unknown) => e);

    expect(err).toBe(original);
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("an explicit null body is still enqueued correctly (queueable) — only opaque non-string bodies are excluded (CodeRabbit PR #51 nit)", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);

    await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: null,
    }).catch(() => {});

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].body).toBe("");
  });

  it("an omitted body (undefined) is also still enqueued correctly (queueable)", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);

    await authFetch("/api/equipment/eq-1/checkout", { method: "POST" }).catch(() => {});

    const snapshot = getOfflineQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].body).toBe("");
  });

  it("offline + emergency mutation: throws EmergencyOfflineError and is NEVER enqueued", async () => {
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const err = await authFetch("/api/code-blue/sessions", {
      method: "POST",
      body: JSON.stringify({ roomId: "r1" }),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmergencyOfflineError);
    expect(getOfflineQueueSnapshot()).toHaveLength(0); // frozen doctrine — never queued
  });

  it("offline + GET: no enqueue (reads are never queued)", async () => {
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    await authFetch("/api/equipment").catch(() => {});

    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("online + non-emergency mutation success: no enqueue (only offline failures are captured)", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await authFetch("/api/equipment/eq-1/checkout", { method: "POST", body: "{}" });

    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });

  it("a caller-aborted request is never enqueued (cancellation, not offline)", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    mockFetch.mockRejectedValue(abortError);

    const err = await authFetch("/api/equipment/eq-1/checkout", {
      method: "POST",
      body: "{}",
    }).catch((e: unknown) => e);

    expect(err).toBe(abortError);
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
  });
});
