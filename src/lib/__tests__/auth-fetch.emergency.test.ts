/**
 * G4 — fetch-layer wiring of the emergency-block classifier.
 *
 * Doctrine under test: offline + emergency mutation → loud EmergencyOfflineError
 * (never queued/retried); offline + non-emergency → original network error
 * unchanged; online + emergency → passes through 100% untouched.
 */
import { authFetch } from "../auth-fetch";
import { setCurrentUserId, setStoredBearerToken } from "../auth-store";
import {
  _clearEmergencyBlockBufferForTests,
  EmergencyOfflineError,
  readEmergencyBlockBuffer,
} from "../emergency-block";

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();
const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  // Assigning undefined would store the string "undefined" — delete instead.
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
});

afterEach(() => {
  mockFetch.mockReset();
  setStoredBearerToken(null);
  setCurrentUserId(null);
  _clearEmergencyBlockBufferForTests();
});

const NETWORK_ERROR = () => new TypeError("Network request failed");

describe("authFetch emergency-block wiring", () => {
  it("offline + emergency mutation: throws EmergencyOfflineError and buffers the attempt", async () => {
    mockFetch.mockRejectedValue(NETWORK_ERROR());

    const attempt = authFetch("/api/code-blue/sessions", {
      method: "POST",
      body: JSON.stringify({ roomId: "r1" }),
    });

    await expect(attempt).rejects.toBeInstanceOf(EmergencyOfflineError);
    expect(mockFetch).toHaveBeenCalledTimes(1); // fail loud — no retry, no queue
    const buffer = readEmergencyBlockBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toMatchObject({
      path: "/api/code-blue/sessions",
      method: "POST",
      endpointClass: "start",
    });
  });

  it("offline + emergency log/end/presence variants all throw EmergencyOfflineError", async () => {
    const cases = [
      { path: "/api/code-blue/sessions/s-1/logs", method: "POST", cls: "log" },
      { path: "/api/code-blue/sessions/s-1/end", method: "PATCH", cls: "end" },
      { path: "/api/code-blue/sessions/s-1/presence", method: "PATCH", cls: "presence" },
    ] as const;
    for (const { path, method, cls } of cases) {
      mockFetch.mockRejectedValueOnce(NETWORK_ERROR());
      const err = await authFetch(path, { method, body: "{}" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EmergencyOfflineError);
      expect((err as EmergencyOfflineError).endpointClass).toBe(cls);
    }
    expect(readEmergencyBlockBuffer()).toHaveLength(cases.length);
  });

  it("offline + non-emergency mutation: original network error propagates unchanged, no buffer entry", async () => {
    const original = NETWORK_ERROR();
    mockFetch.mockRejectedValue(original);

    const err = await authFetch("/api/equipment/scan", {
      method: "POST",
      body: JSON.stringify({ equipmentId: "eq1" }),
    }).catch((e: unknown) => e);

    expect(err).toBe(original); // byte-identical behavior for existing call sites
    expect(err).not.toBeInstanceOf(EmergencyOfflineError);
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });

  it("online + emergency mutation: passes through untouched (response returned, nothing buffered)", async () => {
    const response = { ok: true, status: 201, json: async () => ({ id: "s-1" }) };
    mockFetch.mockResolvedValue(response);

    const res = await authFetch("/api/code-blue/sessions", {
      method: "POST",
      body: JSON.stringify({ roomId: "r1" }),
    });

    expect(res).toBe(response);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
    // Auth header still attached — the wiring must not disturb the request shape.
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/code-blue/sessions");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer a.b.c");
  });

  it("online + non-emergency GET: passes through untouched", async () => {
    const response = { ok: true, status: 200, json: async () => ({ items: [] }) };
    mockFetch.mockResolvedValue(response);

    const res = await authFetch("/api/equipment");

    expect(res).toBe(response);
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });

  it("reachable-server 401 on an emergency path stays an auth failure, not an offline block", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const err = await authFetch("/api/code-blue/sessions", {
      method: "POST",
      body: "{}",
    }).catch((e: unknown) => e);

    expect((err as Error).name).toBe("AuthFetchError");
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });
});
