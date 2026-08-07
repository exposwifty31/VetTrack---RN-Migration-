import type { EquipmentWaitlistSnapshot } from "@vettrack/shared";

import {
  confidenceTone,
  deriveCustody,
  deriveWaitlist,
  readinessTone,
  statusTone,
  usageTone,
} from "../equipment-detail-derive";

const NOW = Date.parse("2026-08-07T12:00:00Z");

describe("deriveCustody", () => {
  it("is available for any non-checked_out custody state (row-status semantics)", () => {
    expect(deriveCustody({ custodyState: "available" }, "u1", NOW)).toEqual({ kind: "available" });
    expect(deriveCustody({ custodyState: "untracked" }, "u1", NOW)).toEqual({ kind: "available" });
    expect(deriveCustody({}, "u1", NOW)).toEqual({ kind: "available" });
  });

  it("marks held-by-me only when checkedOutById matches the current user", () => {
    const base = { custodyState: "checked_out", checkedOutById: "u1", checkedOutByEmail: "a@b.c" };
    expect(deriveCustody(base, "u1", NOW)).toMatchObject({ kind: "held", byMe: true });
    expect(deriveCustody(base, "u2", NOW)).toMatchObject({ kind: "held", byMe: false, email: "a@b.c" });
    expect(deriveCustody(base, null, NOW)).toMatchObject({ kind: "held", byMe: false });
  });

  it("derives due time from checkedOutAt + expectedReturnMinutes and flags overdue strictly past due", () => {
    const checkedOutAt = "2026-08-07T10:00:00Z";
    const view = deriveCustody(
      { custodyState: "checked_out", checkedOutAt, expectedReturnMinutes: 60 },
      null,
      NOW,
    );
    expect(view).toMatchObject({
      kind: "held",
      sinceMs: Date.parse(checkedOutAt),
      dueMs: Date.parse("2026-08-07T11:00:00Z"),
      overdue: true,
    });

    // Exactly at the due boundary → NOT overdue (strict comparison).
    const atBoundary = deriveCustody(
      { custodyState: "checked_out", checkedOutAt, expectedReturnMinutes: 120 },
      null,
      NOW,
    );
    expect(atBoundary).toMatchObject({ dueMs: NOW, overdue: false });
  });

  it("yields null time fields on missing/unparseable timestamps — never fabricates", () => {
    expect(
      deriveCustody({ custodyState: "checked_out", checkedOutAt: "garbage" }, null, NOW),
    ).toMatchObject({ sinceMs: null, dueMs: null, overdue: false });
    expect(
      deriveCustody({ custodyState: "checked_out", expectedReturnMinutes: 30 }, null, NOW),
    ).toMatchObject({ sinceMs: null, dueMs: null });
  });
});

describe("tone maps", () => {
  it("maps every server status enum value; unknown degrades to neutral", () => {
    expect(statusTone("ok")).toBe("success");
    expect(statusTone("sterilized")).toBe("info");
    expect(statusTone("maintenance")).toBe("warning");
    expect(statusTone("needs_attention")).toBe("warning");
    expect(statusTone("overdue")).toBe("warning");
    expect(statusTone("issue")).toBe("danger");
    expect(statusTone("critical")).toBe("danger");
    expect(statusTone("inactive")).toBe("neutral");
    expect(statusTone("something_new")).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
  });

  it("maps readiness and usage states", () => {
    expect(readinessTone("ready")).toBe("success");
    expect(readinessTone("not_ready")).toBe("warning");
    expect(readinessTone("unknown")).toBe("neutral");
    expect(usageTone("available")).toBe("success");
    expect(usageTone("in_use")).toBe("info");
    expect(usageTone("staged")).toBe("warning");
    expect(usageTone("emergency_use")).toBe("danger");
    expect(usageTone(undefined)).toBe("neutral");
  });
});

function snapshot(overrides: Partial<EquipmentWaitlistSnapshot>): EquipmentWaitlistSnapshot {
  return {
    equipmentId: "eq1",
    queueSize: 0,
    myPosition: null,
    myStatus: null,
    reservationExpiresAt: null,
    notifiedUserId: null,
    entries: [],
    ...overrides,
  };
}

describe("deriveWaitlist", () => {
  it("not joined when myStatus is null or a terminal status", () => {
    expect(deriveWaitlist(snapshot({}))).toEqual({
      joined: false,
      position: null,
      queueSize: 0,
      reservedUntilMs: null,
    });
    expect(deriveWaitlist(snapshot({ myStatus: "fulfilled", myPosition: 2 }))).toMatchObject({
      joined: false,
      position: null,
    });
    expect(deriveWaitlist(snapshot({ myStatus: "expired" }))).toMatchObject({ joined: false });
  });

  it("joined while waiting, carrying position + queue size", () => {
    expect(deriveWaitlist(snapshot({ myStatus: "waiting", myPosition: 3, queueSize: 5 }))).toEqual({
      joined: true,
      position: 3,
      queueSize: 5,
      reservedUntilMs: null,
    });
  });

  it("notified carries the reservation window", () => {
    const until = "2026-08-07T12:10:00Z";
    expect(
      deriveWaitlist(snapshot({ myStatus: "notified", myPosition: 1, reservationExpiresAt: until })),
    ).toEqual({
      joined: true,
      position: 1,
      queueSize: 0,
      reservedUntilMs: Date.parse(until),
    });
  });
});

describe("confidenceTone", () => {
  it("stale freshness dominates strength", () => {
    expect(confidenceTone({ evidenceStrength: "high", evidenceFreshness: "stale" })).toBe("stale");
  });

  it("current freshness maps strength high/medium/low → success/info/warning", () => {
    expect(confidenceTone({ evidenceStrength: "high", evidenceFreshness: "current" })).toBe("success");
    expect(confidenceTone({ evidenceStrength: "medium", evidenceFreshness: "current" })).toBe("info");
    expect(confidenceTone({ evidenceStrength: "low", evidenceFreshness: "current" })).toBe("warning");
  });
});
