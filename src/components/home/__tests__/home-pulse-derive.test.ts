/**
 * Pure-derivation tests for the home daily pulse (Slice 5): cursor-page
 * accumulation + dedupe, hero-state mapping, picker clock math, the coded
 * error → copy-key map, and the ONE invalidation spec the screen mounts
 * (vocabulary + keys locked — the audit-invalidation wiring contract).
 */
import type { ActivityPage, HomeDashboard } from "@/lib/api/home";

import {
  adjustmentErrorKey,
  clockTimeFromIso,
  deriveShiftHeroState,
  flattenActivityPages,
  homePulseInvalidationSpec,
  shiftClockTime,
} from "../home-pulse-derive";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-uuid" }));

function scanItem(id: string, timestamp: string) {
  return {
    id,
    type: "scan" as const,
    equipmentId: `eq-${id}`,
    equipmentName: `Unit ${id}`,
    status: "ok",
    note: null,
    userId: "user-1",
    userEmail: "tech@example.com",
    timestamp,
  };
}

describe("flattenActivityPages", () => {
  it("accumulates pages in order", () => {
    const pages: ActivityPage[] = [
      { items: [scanItem("a", "2026-08-07T10:00:00.000Z"), scanItem("b", "2026-08-07T09:00:00.000Z")], nextCursor: "2026-08-07T09:00:00.000Z" },
      { items: [scanItem("c", "2026-08-07T08:00:00.000Z")], nextCursor: null },
    ];

    expect(flattenActivityPages(pages).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("dedupes by id when a refetched page 1 re-serves a row", () => {
    const pages: ActivityPage[] = [
      { items: [scanItem("new", "2026-08-07T11:00:00.000Z"), scanItem("a", "2026-08-07T10:00:00.000Z")], nextCursor: "x" },
      { items: [scanItem("a", "2026-08-07T10:00:00.000Z"), scanItem("b", "2026-08-07T09:00:00.000Z")], nextCursor: null },
    ];

    expect(flattenActivityPages(pages).map((i) => i.id)).toEqual(["new", "a", "b"]);
  });

  it("returns [] for undefined pages (still loading)", () => {
    expect(flattenActivityPages(undefined)).toEqual([]);
  });
});

describe("deriveShiftHeroState", () => {
  const BASE: HomeDashboard = {
    shift: null,
    nextShift: null,
    streak: 0,
    tasksCompletedToday: 0,
    scansToday: 0,
  };

  it("is loading without a dashboard", () => {
    expect(deriveShiftHeroState(undefined)).toEqual({ kind: "loading" });
  });

  it("maps an active shift to onShift with its window", () => {
    const dashboard: HomeDashboard = {
      ...BASE,
      shift: { startedAt: "2026-08-07T05:00:00.000Z", endsAt: "2026-08-07T13:00:00.000Z", role: "technician" },
    };
    expect(deriveShiftHeroState(dashboard)).toEqual({
      kind: "onShift",
      endsAt: "2026-08-07T13:00:00.000Z",
      role: "technician",
    });
  });

  it("maps no shift to offShift carrying the next start (startsAt field)", () => {
    const dashboard: HomeDashboard = {
      ...BASE,
      nextShift: { startsAt: "2026-08-08T05:00:00.000Z", endsAt: "2026-08-08T13:00:00.000Z", role: "vet" },
    };
    expect(deriveShiftHeroState(dashboard)).toEqual({
      kind: "offShift",
      nextStartsAt: "2026-08-08T05:00:00.000Z",
    });
    expect(deriveShiftHeroState(BASE)).toEqual({ kind: "offShift", nextStartsAt: null });
  });
});

describe("clockTimeFromIso", () => {
  it("renders the device-local HH:MM of an instant", () => {
    const iso = new Date(2026, 7, 7, 16, 5).toISOString();
    expect(clockTimeFromIso(iso)).toBe("16:05");
  });

  it("returns null for garbage / missing input", () => {
    expect(clockTimeFromIso("not-a-date")).toBeNull();
    expect(clockTimeFromIso(null)).toBeNull();
    expect(clockTimeFromIso(undefined)).toBeNull();
  });
});

describe("shiftClockTime", () => {
  it("steps forward and back", () => {
    expect(shiftClockTime("16:00", 15)).toBe("16:15");
    expect(shiftClockTime("16:00", -15)).toBe("15:45");
    expect(shiftClockTime("16:00", 60)).toBe("17:00");
  });

  it("wraps across midnight in both directions", () => {
    expect(shiftClockTime("23:50", 15)).toBe("00:05");
    expect(shiftClockTime("00:05", -15)).toBe("23:50");
  });

  it("returns malformed input unchanged (stepper can never corrupt the field)", () => {
    expect(shiftClockTime("later", 15)).toBe("later");
    expect(shiftClockTime("25:00", 15)).toBe("25:00");
  });

  it("rejects out-of-range components instead of normalizing them", () => {
    // "12:99" must NOT become "13:39" (silent normalization of invalid input).
    expect(shiftClockTime("12:99", 0)).toBe("12:99");
    expect(shiftClockTime("12:60", 15)).toBe("12:60");
    expect(shiftClockTime("24:00", 15)).toBe("24:00");
    expect(shiftClockTime("99:15", -15)).toBe("99:15");
  });

  it("accepts the exact boundary values", () => {
    expect(shiftClockTime("23:59", 1)).toBe("00:00");
    expect(shiftClockTime("00:00", -1)).toBe("23:59");
    expect(shiftClockTime("0:59", 1)).toBe("01:00");
  });
});

describe("adjustmentErrorKey", () => {
  it("maps every coded rejection to its copy key, else generic", () => {
    expect(adjustmentErrorKey("NOT_ON_SHIFT")).toBe("shiftAdjustments.errors.notOnShift");
    expect(adjustmentErrorKey("DUPLICATE_PENDING")).toBe("shiftAdjustments.errors.duplicatePending");
    expect(adjustmentErrorKey("NOT_AN_EXTENSION")).toBe("shiftAdjustments.errors.notAnExtension");
    expect(adjustmentErrorKey("NOT_EARLIER")).toBe("shiftAdjustments.errors.notEarlier");
    expect(adjustmentErrorKey("INVALID_TIME")).toBe("shiftAdjustments.errors.invalidTime");
    expect(adjustmentErrorKey("INVALID_REASON")).toBe("shiftAdjustments.errors.invalidReason");
    expect(adjustmentErrorKey("SOMETHING_ELSE")).toBe("common.errorGeneric");
    expect(adjustmentErrorKey(null)).toBe("common.errorGeneric");
  });
});

describe("homePulseInvalidationSpec (audit-invalidation wiring contract)", () => {
  it("carries the verified audit vocabularies and the four domain roots", () => {
    const spec = homePulseInvalidationSpec();

    // Scan/transfer writers + task lifecycle + shift adjustments — and nothing else.
    expect([...spec.auditActionTypes].sort()).toEqual([
      "equipment_bulk_deleted",
      "equipment_bulk_moved",
      "equipment_checked_out",
      "equipment_returned",
      "equipment_scanned",
      "equipment_updated",
      "room_bulk_verified",
      "shift_adjustment_approved",
      "shift_adjustment_cancelled",
      "shift_adjustment_rejected",
      "shift_adjustment_requested",
      "task_cancelled",
      "task_completed",
      "task_created",
      "task_started",
      "task_updated",
    ]);
    expect(spec.typePrefixes).toEqual(["TASK_"]);
    expect(spec.queryKeys).toEqual([["home"], ["tasks"], ["shiftAdjustments"], ["nudges"]]);
  });

  it("is JSON-serializable (the useRealtimeInvalidation stability contract)", () => {
    const spec = homePulseInvalidationSpec();
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });
});
