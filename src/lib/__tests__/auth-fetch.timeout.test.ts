/**
 * W2b transport: the RN fetch layer had NO request timeout — a hung server or
 * dead-air connection left a request pending forever. authFetch now arms an
 * AbortController timeout, and composes a caller-supplied signal so React-Query
 * / unmount cancellation still works.
 */
import { authFetch, REQUEST_TIMEOUT_MS, setClerkTokenGetter } from "../auth-fetch";
import { setCurrentUserId, setStoredBearerToken } from "../auth-store";

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();
const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

/** A fetch that never resolves on its own — only settles when its signal aborts. */
function hangUntilAborted(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init.signal;
    if (!signal) return; // never settles — surfaces a wiring gap loudly via test timeout
    const fail = () => reject(signal.reason ?? Object.assign(new Error("Aborted"), { name: "AbortError" }));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail);
  });
}

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
  jest.useFakeTimers();
  setStoredBearerToken("a.b.c");
  setCurrentUserId("user_1");
});

afterEach(() => {
  jest.useRealTimers();
  mockFetch.mockReset();
  setStoredBearerToken(null);
});

describe("authFetch request timeout", () => {
  it("aborts a hung request once REQUEST_TIMEOUT_MS elapses", async () => {
    mockFetch.mockImplementation(hangUntilAborted);
    const pending = authFetch("/api/users/me");
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("aborts when the caller's own signal fires before the timeout", async () => {
    mockFetch.mockImplementation(hangUntilAborted);
    const caller = new AbortController();
    const pending = authFetch("/api/users/me", { signal: caller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    caller.abort();
    await assertion;
  });

  it("does not abort a request that resolves before the timeout", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "u1" }) } as unknown as Response);
    await expect(authFetch("/api/users/me")).resolves.toMatchObject({ status: 200 });
  });

  it("applies the abort budget to TOKEN RESOLUTION, not only to the fetch", async () => {
    // The gap the first version of this timeout left. `armRequestTimeout` fires,
    // but the await that precedes the fetch is `resolveAuthSnapshot()` -> Clerk's
    // getToken(), which reads a keychain and may hit the network. A getter that
    // never settles left authFetch pending forever with a fully-armed 15s budget
    // sitting unused one line below it — the request never reached the fetch the
    // budget was guarding.
    setClerkTokenGetter(() => new Promise<string>(() => {})); // never settles
    try {
      const pending = authFetch("/api/users/me");
      const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
      expect(mockFetch).not.toHaveBeenCalled(); // never got past the token
    } finally {
      setClerkTokenGetter(null);
    }
  });

  it("lets a caller cancel while the token getter is still stalled", async () => {
    setClerkTokenGetter(() => new Promise<string>(() => {}));
    try {
      const caller = new AbortController();
      const pending = authFetch("/api/users/me", { signal: caller.signal });
      const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await Promise.resolve();
      caller.abort();
      await assertion;
    } finally {
      setClerkTokenGetter(null);
    }
  });
});
