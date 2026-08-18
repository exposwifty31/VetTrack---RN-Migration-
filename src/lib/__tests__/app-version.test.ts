import Constants from "expo-constants";

import {
  compareVersions,
  fetchLatestAppVersion,
  getRunningAppVersion,
  resolveUpdateNotice,
} from "../app-version";

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.3.0" } }));

/** The mock object the module under test imports — mutated per test. */
const constantsMock = Constants as unknown as { expoConfig: { version?: unknown } | null };

describe("compareVersions", () => {
  it("orders by numeric segment, not lexically", () => {
    // "1.2.10" < "1.2.9" as strings; the whole point is that it must not be.
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
  });

  it("treats equal versions as equal", () => {
    expect(compareVersions("1.3.0", "1.3.0")).toBe(0);
    expect(compareVersions("0.0.0", "0.0.0")).toBe(0);
  });

  it("pads missing trailing segments with zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.3", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0);
  });

  it("rejects non-numeric junk instead of returning NaN", () => {
    // The ported implementation returned NaN here, which is neither >0, <0 nor 0 —
    // every caller comparison silently reads as "not newer".
    expect(compareVersions("1.2.x", "1.2.0")).toBeNull();
    expect(compareVersions("1.2.0", "banana")).toBeNull();
    expect(compareVersions("", "1.0.0")).toBeNull();
  });

  it("rejects strings Number() silently coerces", () => {
    // This is the release-preflight "0x1E" bug class: Number("0x1E") === 30.
    expect(compareVersions("0x1E", "1.0.0")).toBeNull();
    expect(compareVersions("1.0. 1", "1.0.1")).toBeNull();
    expect(compareVersions(" 1 .0.0", "1.0.0")).toBeNull();
    expect(compareVersions("1e3.0.0", "1.0.0")).toBeNull();
    expect(compareVersions("+1.0.0", "1.0.0")).toBeNull();
    expect(compareVersions("Infinity.0.0", "1.0.0")).toBeNull();
    expect(compareVersions("-1.0.0", "1.0.0")).toBeNull();
  });

  it("rejects empty segments", () => {
    expect(compareVersions("1..2", "1.0.2")).toBeNull();
    expect(compareVersions(".1", "0.1")).toBeNull();
    expect(compareVersions("1.", "1.0")).toBeNull();
  });

  it("rejects segments beyond safe-integer precision", () => {
    expect(compareVersions("1.2.99999999999999999999", "1.2.0")).toBeNull();
  });

  it("rejects prerelease and build-metadata suffixes", () => {
    // DECISION: this comparator is numeric-dotted only. Semver prerelease ordering
    // ("1.3.0-beta.1" < "1.3.0") is deliberately out of scope — reject rather than
    // guess, so a prerelease build never reads as "up to date" by accident.
    expect(compareVersions("1.3.0-beta.1", "1.3.0")).toBeNull();
    expect(compareVersions("1.3.0", "1.3.0+build.5")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(compareVersions(null as unknown as string, "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", undefined as unknown as string)).toBeNull();
  });
});

describe("getRunningAppVersion", () => {
  afterEach(() => {
    constantsMock.expoConfig = { version: "1.3.0" };
  });

  it("reads the version the running JS bundle was configured with", () => {
    expect(getRunningAppVersion()).toBe("1.3.0");
  });

  it("returns null rather than a fabricated version when expoConfig is absent", () => {
    constantsMock.expoConfig = null;
    expect(getRunningAppVersion()).toBeNull();
  });

  it("returns null when the version field is missing or not a string", () => {
    constantsMock.expoConfig = {};
    expect(getRunningAppVersion()).toBeNull();
    constantsMock.expoConfig = { version: 130 };
    expect(getRunningAppVersion()).toBeNull();
    constantsMock.expoConfig = { version: "   " };
    expect(getRunningAppVersion()).toBeNull();
  });
});

describe("fetchLatestAppVersion", () => {
  const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.test";
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_ORIGIN = prevOrigin;
  });

  function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it("returns the version string from a well-formed feed", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ version: "1.4.0" }));
    await expect(
      fetchLatestAppVersion("/api/app-version", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe("1.4.0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative path against EXPO_PUBLIC_API_ORIGIN", async () => {
    const fetchImpl = jest.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ version: "1.4.0" }),
    );
    await fetchLatestAppVersion("/api/app-version", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.example.test/api/app-version");
  });

  it("sends no credentials — the feed must be readable while signed out", async () => {
    const fetchImpl = jest.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ version: "1.4.0" }),
    );
    await fetchLatestAppVersion("/api/app-version", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const init = fetchImpl.mock.calls[0][1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("returns null when the API origin is not configured, instead of throwing", async () => {
    // resolveApiUrl throws when EXPO_PUBLIC_API_ORIGIN is unset (api-origin.ts:19-22).
    // A version check must never be the thing that takes the app down.
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
    const fetchImpl = jest.fn(async () => jsonResponse({ version: "1.4.0" }));
    await expect(
      fetchLatestAppVersion("/api/app-version", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ version: "1.4.0" }, false, 503));
    await expect(
      fetchLatestAppVersion("/api/app-version", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeNull();
  });

  it("returns null when the network throws", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(
      fetchLatestAppVersion("/api/app-version", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));
    await expect(
      fetchLatestAppVersion("/api/app-version", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeNull();
  });

  it("returns null when the version field is absent or not a string", async () => {
    for (const body of [{}, { version: 140 }, { version: null }, null, "1.4.0"]) {
      const fetchImpl = jest.fn(async () => jsonResponse(body));
      await expect(
        fetchLatestAppVersion("/api/app-version", {
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).resolves.toBeNull();
    }
  });

  it("aborts a hanging request and returns null", async () => {
    const fetchImpl = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );
    await expect(
      fetchLatestAppVersion("/api/app-version", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 20,
      }),
    ).resolves.toBeNull();
  });
});

describe("resolveUpdateNotice", () => {
  it("reports a notice only when the running build is strictly behind", () => {
    expect(resolveUpdateNotice("1.2.9", "1.3.0")).toEqual({
      running: "1.2.9",
      latest: "1.3.0",
    });
  });

  it("returns null when the running build is current", () => {
    expect(resolveUpdateNotice("1.3.0", "1.3.0")).toBeNull();
  });

  it("returns null when the running build is AHEAD of the feed", () => {
    // Not hypothetical: https://vettrack.uk/api/version reports 1.2.0 (the web
    // deploy's own version) while this app ships 1.3.0. A feed that is behind
    // must produce silence, never an inverted "update available" nag.
    expect(resolveUpdateNotice("1.3.0", "1.2.0")).toBeNull();
  });

  it("returns null when either side is missing or unparseable", () => {
    expect(resolveUpdateNotice(null, "1.3.0")).toBeNull();
    expect(resolveUpdateNotice("1.3.0", null)).toBeNull();
    expect(resolveUpdateNotice("1.3.0-beta.1", "1.4.0")).toBeNull();
    expect(resolveUpdateNotice("0x1E", "1.4.0")).toBeNull();
  });
});
