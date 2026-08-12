/**
 * Code Blue derivation — server response -> view state. Pure: no i18n, no RN,
 * no Date.now() — `nowMs` is threaded so every case is deterministic (the
 * alerts-derive precedent).
 */
import { deriveCodeBlueView, formatElapsedMs } from "@/lib/code-blue-derive";
import type { ActiveCodeBlueResponse, CodeBlueSession } from "@/types/code-blue";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function session(overrides: Partial<CodeBlueSession> = {}): CodeBlueSession {
  return {
    id: "cb-1",
    clinicId: "dev-clinic-default",
    startedAt: "2026-08-10T11:57:00.000Z",
    startedBy: "user-1",
    startedByName: "Dr. Cohen",
    managerUserId: "user-1",
    managerUserName: "Dr. Cohen",
    status: "active",
    outcome: null,
    preCheckPassed: null,
    endedAt: null,
    createdAt: "2026-08-10T11:57:00.000Z",
    isReconciled: false,
    reconciledAt: null,
    reconciledByUserId: null,
    ...overrides,
  };
}

function response(overrides: Partial<ActiveCodeBlueResponse> = {}): ActiveCodeBlueResponse {
  return {
    session: null,
    logEntries: [],
    presence: [],
    cartStatus: null,
    linkedEquipment: [],
    ...overrides,
  };
}

describe("deriveCodeBlueView", () => {
  it('returns kind "none" when there is no active session', () => {
    expect(deriveCodeBlueView(response(), NOW)).toEqual({ kind: "none" });
  });

  it('returns kind "active" with computed elapsedMs when a session is active', () => {
    const view = deriveCodeBlueView(response({ session: session() }), NOW);
    expect(view).toMatchObject({
      kind: "active",
      sessionId: "cb-1",
      managerUserName: "Dr. Cohen",
      startedByName: "Dr. Cohen",
      startedAt: "2026-08-10T11:57:00.000Z",
      elapsedMs: 3 * 60 * 1000, // NOW - startedAt = 3 minutes
    });
  });

  it("clamps elapsedMs to 0 under clock skew (startedAt after nowMs)", () => {
    const view = deriveCodeBlueView(
      response({ session: session({ startedAt: "2026-08-10T12:05:00.000Z" }) }),
      NOW,
    );
    if (view.kind !== "active") throw new Error("expected active view");
    expect(view.elapsedMs).toBe(0);
  });

  it("falls back to elapsedMs 0 when startedAt is unparsable", () => {
    const view = deriveCodeBlueView(
      response({ session: session({ startedAt: "not-a-date" }) }),
      NOW,
    );
    if (view.kind !== "active") throw new Error("expected active view");
    expect(view.elapsedMs).toBe(0);
  });

  it("sorts log entries ascending by elapsedMs even when the input is out of order", () => {
    const view = deriveCodeBlueView(
      response({
        session: session(),
        logEntries: [
          {
            id: "log-2",
            sessionId: "cb-1",
            clinicId: "dev-clinic-default",
            idempotencyKey: "k2",
            elapsedMs: 120_000,
            label: "Epinephrine given",
            category: "note",
            equipmentId: null,
            loggedByUserId: "user-2",
            loggedByName: "Tech Levi",
            createdAt: "2026-08-10T11:59:00.000Z",
          },
          {
            id: "log-1",
            sessionId: "cb-1",
            clinicId: "dev-clinic-default",
            idempotencyKey: "k1",
            elapsedMs: 0,
            label: "Defibrillator",
            category: "equipment",
            equipmentId: "eq-1",
            loggedByUserId: "user-1",
            loggedByName: "Dr. Cohen",
            createdAt: "2026-08-10T11:57:00.000Z",
          },
        ],
      }),
      NOW,
    );
    if (view.kind !== "active") throw new Error("expected active view");
    expect(view.logEntries.map((e) => e.id)).toEqual(["log-1", "log-2"]);
  });

  it("maps presence rows to id + name", () => {
    const view = deriveCodeBlueView(
      response({
        session: session(),
        presence: [
          { sessionId: "cb-1", userId: "user-1", userName: "Dr. Cohen", lastSeenAt: "2026-08-10T11:59:50.000Z" },
        ],
      }),
      NOW,
    );
    if (view.kind !== "active") throw new Error("expected active view");
    expect(view.presence).toEqual([{ userId: "user-1", userName: "Dr. Cohen" }]);
  });

  it("passes through cartStatus when present, null when absent", () => {
    const withCart = deriveCodeBlueView(
      response({
        session: session(),
        cartStatus: {
          lastCheckedAt: "2026-08-10T08:00:00.000Z",
          allPassed: true,
          performedByName: "Tech Levi",
        },
      }),
      NOW,
    );
    if (withCart.kind !== "active") throw new Error("expected active view");
    expect(withCart.cartStatus).toEqual({
      allPassed: true,
      performedByName: "Tech Levi",
      lastCheckedAt: "2026-08-10T08:00:00.000Z",
    });

    const withoutCart = deriveCodeBlueView(response({ session: session() }), NOW);
    if (withoutCart.kind !== "active") throw new Error("expected active view");
    expect(withoutCart.cartStatus).toBeNull();
  });
});

describe("formatElapsedMs", () => {
  it("formats under an hour as MM:SS", () => {
    expect(formatElapsedMs(0)).toBe("00:00");
    expect(formatElapsedMs(65_000)).toBe("01:05");
    expect(formatElapsedMs(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("formats an hour or more as H:MM:SS", () => {
    expect(formatElapsedMs(60 * 60_000)).toBe("1:00:00");
    expect(formatElapsedMs(2 * 60 * 60_000 + 3 * 60_000 + 4_000)).toBe("2:03:04");
  });
});
