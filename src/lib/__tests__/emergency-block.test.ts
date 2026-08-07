/**
 * G4 — emergency-block classifier + diagnostic FIFO buffer.
 *
 * The block list is asserted AGAINST the vendored manifest itself
 * (`EMERGENCY_OFFLINE_BLOCK_MUTATIONS` from @vettrack/contracts), so a
 * VETTRACK_SHA bump that adds an emergency mutation is covered without
 * touching this suite.
 */
import { EMERGENCY_OFFLINE_BLOCK_MUTATIONS } from "@vettrack/contracts";

import {
  _clearEmergencyBlockBufferForTests,
  classifyEmergencyEndpoint,
  EmergencyOfflineError,
  emergencyOfflineErrorFromFailedDispatch,
  isNetworkFailure,
  readEmergencyBlockBuffer,
} from "../emergency-block";

afterEach(() => {
  _clearEmergencyBlockBufferForTests();
});

describe("classifyEmergencyEndpoint (manifest-driven)", () => {
  it("classifies EVERY vendored offline-block mutation as blocked", () => {
    expect(EMERGENCY_OFFLINE_BLOCK_MUTATIONS.length).toBeGreaterThan(0);
    for (const entry of EMERGENCY_OFFLINE_BLOCK_MUTATIONS) {
      expect(classifyEmergencyEndpoint(entry.samplePathname, entry.method)).toBe(entry.class);
    }
  });

  it("classifies lowercase methods (fetch init.method is case-insensitive)", () => {
    for (const entry of EMERGENCY_OFFLINE_BLOCK_MUTATIONS) {
      expect(classifyEmergencyEndpoint(entry.samplePathname, entry.method.toLowerCase())).toBe(
        entry.class,
      );
    }
  });

  it("never classifies reads — GET on every emergency pathname is null", () => {
    for (const entry of EMERGENCY_OFFLINE_BLOCK_MUTATIONS) {
      expect(classifyEmergencyEndpoint(entry.samplePathname, "GET")).toBeNull();
    }
    expect(classifyEmergencyEndpoint("/api/code-blue/sessions/active", "GET")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/code-blue/history", "GET")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/display/snapshot", "GET")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/realtime/outbox-head", "GET")).toBeNull();
  });

  it("does NOT classify custody/inventory mutations as emergency", () => {
    expect(classifyEmergencyEndpoint("/api/equipment/scan", "POST")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/equipment/eq-1/checkout", "POST")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/equipment/eq-1/revert", "POST")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/containers/c-1/dispense", "POST")).toBeNull();
    expect(classifyEmergencyEndpoint("/api/equipment/eq-1/waitlist", "POST")).toBeNull();
  });

  it("normalizes query strings and absolute URLs before matching", () => {
    expect(
      classifyEmergencyEndpoint("https://api.example.com/api/code-blue/sessions?src=nfc", "POST"),
    ).toBe("start");
    expect(classifyEmergencyEndpoint("/api/code-blue/one-tap?x=1", "POST")).toBe("start");
  });
});

describe("isNetworkFailure", () => {
  it("treats every known engine's fetch network rejection as offline", () => {
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true); // RN
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true); // Chromium
    expect(isNetworkFailure(new TypeError("Load failed"))).toBe(true); // WebKit
    expect(isNetworkFailure(new TypeError("fetch failed"))).toBe(true); // undici
    expect(
      isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource.")),
    ).toBe(true); // Firefox
  });

  it("does NOT treat non-network TypeErrors as offline (programming errors stay loud as themselves)", () => {
    expect(isNetworkFailure(new TypeError("Invalid URL"))).toBe(false);
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("does NOT treat caller-initiated aborts or app errors as offline", () => {
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    expect(isNetworkFailure(abort)).toBe(false);
    expect(isNetworkFailure(new Error("HTTP 500 for /api/equipment"))).toBe(false);
    expect(isNetworkFailure("not-an-error")).toBe(false);
  });
});

describe("emergencyOfflineErrorFromFailedDispatch", () => {
  const networkErr = new TypeError("Network request failed");

  it("returns EmergencyOfflineError and buffers the attempt for an offline emergency mutation", () => {
    const err = emergencyOfflineErrorFromFailedDispatch(
      networkErr,
      "/api/code-blue/sessions",
      "POST",
    );
    expect(err).toBeInstanceOf(EmergencyOfflineError);
    expect(err?.name).toBe("EmergencyOfflineError");
    expect(err?.endpointClass).toBe("start");
    expect(err?.path).toBe("/api/code-blue/sessions");
    expect(err?.method).toBe("POST");

    const buffer = readEmergencyBlockBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toMatchObject({
      path: "/api/code-blue/sessions",
      method: "POST",
      endpointClass: "start",
    });
    expect(typeof buffer[0].ts).toBe("number");
  });

  it("returns null (caller rethrows original) for offline non-emergency requests, without buffering", () => {
    expect(
      emergencyOfflineErrorFromFailedDispatch(networkErr, "/api/equipment/scan", "POST"),
    ).toBeNull();
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });

  it("returns null for non-network failures even on emergency paths", () => {
    expect(
      emergencyOfflineErrorFromFailedDispatch(
        new Error("boom"),
        "/api/code-blue/sessions",
        "POST",
      ),
    ).toBeNull();
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    expect(
      emergencyOfflineErrorFromFailedDispatch(abort, "/api/code-blue/sessions", "POST"),
    ).toBeNull();
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });

  it("does not mask a programming-error TypeError as an offline block", () => {
    expect(
      emergencyOfflineErrorFromFailedDispatch(
        new TypeError("Invalid URL"),
        "/api/code-blue/sessions",
        "POST",
      ),
    ).toBeNull();
    expect(readEmergencyBlockBuffer()).toHaveLength(0);
  });
});

describe("diagnostic FIFO buffer", () => {
  it("caps at 200 entries and evicts the oldest first", () => {
    const networkErr = new TypeError("Network request failed");
    for (let i = 0; i < 205; i++) {
      emergencyOfflineErrorFromFailedDispatch(
        networkErr,
        `/api/code-blue/sessions/s-${i}/logs`,
        "POST",
      );
    }
    const buffer = readEmergencyBlockBuffer();
    expect(buffer).toHaveLength(200);
    // Entries 0–4 evicted; the oldest survivor is attempt #5.
    expect(buffer[0].path).toBe("/api/code-blue/sessions/s-5/logs");
    expect(buffer[199].path).toBe("/api/code-blue/sessions/s-204/logs");
  });

  it("read accessor returns a snapshot that later blocks do not mutate", () => {
    const networkErr = new TypeError("Network request failed");
    emergencyOfflineErrorFromFailedDispatch(networkErr, "/api/code-blue/sessions", "POST");
    const before = readEmergencyBlockBuffer();
    expect(before).toHaveLength(1);
    emergencyOfflineErrorFromFailedDispatch(networkErr, "/api/code-blue/one-tap", "POST");
    expect(before).toHaveLength(1);
    expect(readEmergencyBlockBuffer()).toHaveLength(2);
  });

  it("returned entries are detached clones — mutating them cannot corrupt the buffer", () => {
    const networkErr = new TypeError("Network request failed");
    emergencyOfflineErrorFromFailedDispatch(networkErr, "/api/code-blue/sessions", "POST");
    const snapshot = readEmergencyBlockBuffer();
    (snapshot[0] as { path: string }).path = "/tampered";
    expect(readEmergencyBlockBuffer()[0].path).toBe("/api/code-blue/sessions");
  });
});
