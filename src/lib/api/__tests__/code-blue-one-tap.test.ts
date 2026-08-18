/**
 * J1 — `codeBlueApi.oneTap` at the real transport layer (only `globalThis.fetch`
 * is faked). Two things under test that a mocked-api unit test cannot prove:
 *
 *   1. the request the SERVER actually receives — correct path, method, and an
 *      `idempotencyToken` actually present in the body (the server's
 *      `oneTapStartSchema` requires it; without it every start 400s);
 *   2. requirement 4 — offline fails LOUD with `EmergencyOfflineError` and the
 *      attempt is NEVER added to the offline write-queue. The classifier-level
 *      coverage for this path already exists (`emergency-block.test.ts`), but
 *      nothing yet pins the NEW client call path end-to-end, and
 *      `enqueueOfflineWrite` runs as a side effect for offline non-emergency
 *      writes (`auth-fetch.offline-queue.test.ts`) — so "not queued" is a real,
 *      falsifiable assertion about this route, not a restatement of the manifest.
 */
import { setCurrentUserId, setStoredBearerToken } from "@/lib/auth-store";
import {
  _clearEmergencyBlockBufferForTests,
  EmergencyOfflineError,
  readEmergencyBlockBuffer,
} from "@/lib/emergency-block";
import {
  _resetOfflineQueueForTests,
  getOfflineQueueSnapshot,
} from "@/lib/offline-queue/offline-queue";

import { codeBlueApi } from "../code-blue";

const mockQueueStore = new Map<string, string>();
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((key: string) => mockQueueStore.get(key) ?? null),
  safeStorageSetItem: jest.fn((key: string, value: string) => {
    mockQueueStore.set(key, value);
    return true;
  }),
  safeStorageRemoveItem: jest.fn((key: string) => mockQueueStore.delete(key)),
}));

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();
const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  if (prevOrigin === undefined) delete process.env.EXPO_PUBLIC_API_ORIGIN;
  else process.env.EXPO_PUBLIC_API_ORIGIN = prevOrigin;
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  setStoredBearerToken("a.b.c");
  setCurrentUserId("user_1");
});

afterEach(() => {
  mockFetch.mockReset();
  mockQueueStore.clear();
  setStoredBearerToken(null);
  setCurrentUserId(null);
  _clearEmergencyBlockBufferForTests();
  _resetOfflineQueueForTests();
});

describe("codeBlueApi.oneTap — request shape", () => {
  it("POSTs /api/code-blue/one-tap with the idempotency token in the body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ outcome: "created", sessionId: "s-1", reservedCartId: "cart-9", pagingState: "queued" }),
    });

    const result = await codeBlueApi.oneTap({
      idempotencyToken: "tok-abc",
      managerUserId: "u1",
      managerUserName: "Dr. Cohen",
    });

    expect(result).toEqual({
      outcome: "created",
      sessionId: "s-1",
      reservedCartId: "cart-9",
      pagingState: "queued",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/code-blue/one-tap");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      idempotencyToken: "tok-abc",
      managerUserId: "u1",
      managerUserName: "Dr. Cohen",
    });
  });

  it("surfaces the 409 start conflict as a coded error carrying the discriminating reason", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: "CODE_BLUE_START_CONFLICT", reason: "ACTIVE_LEASE" }),
    });

    const err = await codeBlueApi
      .oneTap({ idempotencyToken: "tok-abc", managerUserId: "u1", managerUserName: "Dr. Cohen" })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 409, code: "CODE_BLUE_START_CONFLICT", reason: "ACTIVE_LEASE" });
  });
});

describe("codeBlueApi.oneTap — requirement 4: never queued offline", () => {
  it("offline throws EmergencyOfflineError and adds NOTHING to the offline write-queue", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    const err = await codeBlueApi
      .oneTap({ idempotencyToken: "tok-abc", managerUserId: "u1", managerUserName: "Dr. Cohen" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmergencyOfflineError);
    expect((err as EmergencyOfflineError).endpointClass).toBe("start");
    // Fail loud, exactly once — no retry, no replay.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getOfflineQueueSnapshot()).toHaveLength(0);
    expect(readEmergencyBlockBuffer()).toMatchObject([
      { path: "/api/code-blue/one-tap", method: "POST", endpointClass: "start" },
    ]);
  });
});
