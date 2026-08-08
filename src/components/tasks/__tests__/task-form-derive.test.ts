/**
 * Pure tests for the task-form derivations (Slice 3b). No RN, no i18n, no
 * safe-storage mock — the module is deliberately framework-free so the time
 * math, RBAC gates, assignee flattening, and coded-error mapping test in
 * isolation (the equipment-row-status precedent).
 */
import type { TaskMeta } from "@/types/tasks";

import {
  addClockMinutes,
  assigneeOptions,
  assigneeRowKey,
  buildAssigneeRows,
  buildTaskWindow,
  canAssignTasks,
  canCancelTasks,
  canEditTasks,
  clampDuration,
  clockFromIso,
  durationMinutesBetween,
  localPartsMatch,
  mutationErrorKey,
  splitDuration,
  UNASSIGNED_ROW_KEY,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
} from "../task-form-derive";

describe("addClockMinutes", () => {
  it("adds and subtracts within the day", () => {
    expect(addClockMinutes("09:00", 15)).toBe("09:15");
    expect(addClockMinutes("09:00", 60)).toBe("10:00");
    expect(addClockMinutes("09:00", -15)).toBe("08:45");
  });

  it("wraps across midnight in both directions", () => {
    expect(addClockMinutes("23:50", 15)).toBe("00:05");
    expect(addClockMinutes("00:05", -15)).toBe("23:50");
  });

  it("returns malformed / out-of-range input unchanged (never corrupts the field)", () => {
    expect(addClockMinutes("12:99", 15)).toBe("12:99");
    expect(addClockMinutes("late", 15)).toBe("late");
    expect(addClockMinutes("24:00", 15)).toBe("24:00");
  });
});

describe("clampDuration", () => {
  it("clamps to the stepper bounds and defaults non-finite input", () => {
    expect(clampDuration(0)).toBe(MIN_DURATION_MINUTES);
    expect(clampDuration(MAX_DURATION_MINUTES + 60)).toBe(MAX_DURATION_MINUTES);
    expect(clampDuration(90)).toBe(90);
    expect(clampDuration(Number.NaN)).toBe(60);
  });
});

describe("splitDuration", () => {
  it("splits minutes into whole hours + remainder", () => {
    expect(splitDuration(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitDuration(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
  });
});

describe("buildTaskWindow", () => {
  it("emits a timezone-qualified (Z) ISO window with the exact local wall-clock start", () => {
    const window = buildTaskWindow("2026-08-07", "09:30", 60);
    expect(window).not.toBeNull();
    // toISOString always yields a `…Z` suffix → satisfies the server's offset check.
    expect(window!.startTime.endsWith("Z")).toBe(true);
    expect(window!.endTime.endsWith("Z")).toBe(true);
    // Local wall clock round-trips regardless of the machine timezone.
    const start = new Date(window!.startTime);
    expect(start.getHours()).toBe(9);
    expect(start.getMinutes()).toBe(30);
    // Duration is exact and end is strictly after start (server ensureTimeWindow).
    expect(Date.parse(window!.endTime) - Date.parse(window!.startTime)).toBe(60 * 60_000);
  });

  it("returns null for a malformed day, clock, or non-positive duration", () => {
    expect(buildTaskWindow("2026-8-7", "09:00", 60)).toBeNull();
    expect(buildTaskWindow("2026-08-07", "9:0", 60)).toBeNull();
    expect(buildTaskWindow("2026-08-07", "25:00", 60)).toBeNull();
    expect(buildTaskWindow("2026-08-07", "09:00", 0)).toBeNull();
    expect(buildTaskWindow("2026-08-07", "09:00", -30)).toBeNull();
  });

  it("rejects a calendar-invalid day (no silent Date rollover)", () => {
    expect(buildTaskWindow("2026-02-31", "09:00", 60)).toBeNull();
  });
});

describe("localPartsMatch — the DST-gap / calendar-rollover guard", () => {
  // TZ-independent: jest's worker timezone can't be flipped at runtime (V8 caches
  // it), so instead of forcing a real DST zone we hand the guard the Date it WOULD
  // receive after normalization and assert the mismatch is caught. This is the
  // exact symptom of a spring-forward gap: requested 02:30, Date became 03:30.
  const base = { year: 2026, monthIndex: 2, dayOfMonth: 8 };

  it("rejects a wall-clock hour the OS shifted (the DST spring-forward gap)", () => {
    // The Date buildTaskWindow gets back for a skipped 02:30 is the 03:30 instant.
    const normalized = new Date(2026, 2, 8, 3, 30);
    expect(localPartsMatch(normalized, { ...base, hours: 2, minutes: 30 })).toBe(false);
  });

  it("rejects a shifted minute and a rolled-over calendar day", () => {
    expect(localPartsMatch(new Date(2026, 2, 8, 2, 45), { ...base, hours: 2, minutes: 30 })).toBe(
      false,
    );
    // "2026-02-31" → Date rolls into March; month no longer matches.
    const rolled = new Date(2026, 1, 31, 9, 0);
    expect(localPartsMatch(rolled, { year: 2026, monthIndex: 1, dayOfMonth: 31, hours: 9, minutes: 0 })).toBe(
      false,
    );
  });

  it("accepts a Date that faithfully round-trips every part", () => {
    const faithful = new Date(2026, 2, 8, 1, 30);
    expect(localPartsMatch(faithful, { ...base, hours: 1, minutes: 30 })).toBe(true);
  });
});

describe("buildTaskWindow — DST spring-forward gap (end-to-end, DST zones only)", () => {
  it("returns null for a time skipped by the gap when the runtime is in a DST zone", () => {
    // Only exercises end-to-end where the runtime timezone actually has the
    // 02:00→03:00 gap on this date; jest's worker TZ can't be flipped at runtime,
    // so probe and skip otherwise (the deterministic coverage is localPartsMatch).
    const gapExists = new Date(2026, 2, 8, 2, 30).getHours() !== 2;
    if (!gapExists) return;
    expect(buildTaskWindow("2026-03-08", "02:30", 60)).toBeNull();
    // A real time on the same day still builds.
    expect(buildTaskWindow("2026-03-08", "03:30", 60)).not.toBeNull();
  });
});

describe("clockFromIso / durationMinutesBetween", () => {
  it("round-trips a built window back to its clock + duration", () => {
    const window = buildTaskWindow("2026-08-07", "14:15", 90)!;
    expect(clockFromIso(window.startTime)).toBe("14:15");
    expect(durationMinutesBetween(window.startTime, window.endTime)).toBe(90);
  });

  it("returns null for unparseable or non-positive spans", () => {
    expect(clockFromIso(null)).toBeNull();
    expect(clockFromIso("not-a-date")).toBeNull();
    expect(durationMinutesBetween("2026-08-07T10:00:00Z", "2026-08-07T10:00:00Z")).toBeNull();
    expect(durationMinutesBetween(null, "2026-08-07T10:00:00Z")).toBeNull();
  });
});

describe("RBAC gates mirror the task-rbac policy", () => {
  it("create/cancel/assign are senior+ (technician has only read/start/complete)", () => {
    expect(canEditTasks("technician")).toBe(false);
    expect(canCancelTasks("technician")).toBe(false);
    expect(canAssignTasks("technician")).toBe(false);

    for (const role of ["senior_technician", "vet", "admin", "lead_technician"]) {
      expect(canEditTasks(role)).toBe(true);
    }
    // lead_technician can create/cancel/assign; ownership bypass is a separate rule.
    expect(canCancelTasks("lead_technician")).toBe(true);
    expect(canAssignTasks("lead_technician")).toBe(true);
  });

  it("student / empty / unknown roles get nothing", () => {
    for (const role of ["student", "", null, undefined, "who"]) {
      expect(canEditTasks(role)).toBe(false);
      expect(canCancelTasks(role)).toBe(false);
      expect(canAssignTasks(role)).toBe(false);
    }
  });
});

describe("assigneeOptions", () => {
  const meta: TaskMeta = {
    day: "2026-08-07",
    vets: [
      { id: "v1", name: "Bruce", displayName: "Dr. Bruce", role: "vet", shifts: [] },
      {
        id: "v2",
        name: null,
        displayName: null,
        role: "vet",
        shifts: [
          { id: "s1", employeeName: "Ana", startTime: "08:00", endTime: "16:00", role: null },
        ],
      },
    ],
    technicians: [
      // Same id as v1 (a vet with a technician secondary role) → collapses to one,
      // on-shift because the technician source carries a shift.
      {
        id: "v1",
        name: "Bruce",
        displayName: "Dr. Bruce",
        role: "technician",
        shifts: [
          { id: "s2", employeeName: "Bruce", startTime: "09:00", endTime: "17:00", role: "tech" },
        ],
      },
      { id: "t3", name: "Cara", displayName: null, role: "technician", shifts: [] },
    ],
  };

  it("dedupes by id (on-shift wins), partitions on-shift first, and falls back id-ward", () => {
    const options = assigneeOptions(meta);
    // Three distinct staffers (v1 collapsed from both sources).
    expect(options).toHaveLength(3);
    // On-shift {v1, v2} precede the off-shift t3; the label tiebreak within a
    // partition is locale-dependent, so only the partition order is asserted.
    const firstOffIndex = options.findIndex((o) => !o.onShift);
    expect(options.slice(0, firstOffIndex).every((o) => o.onShift)).toBe(true);
    expect(options.slice(firstOffIndex).every((o) => !o.onShift)).toBe(true);
    expect(new Set(options.slice(0, firstOffIndex).map((o) => o.id))).toEqual(
      new Set(["v1", "v2"]),
    );
    expect(options[options.length - 1].id).toBe("t3");
    // v1 collapsed once, marked on-shift by the technician source, keeps its displayName.
    expect(options.find((o) => o.id === "v1")!.label).toBe("Dr. Bruce");
    // v2 has no name/displayName → label falls back to the id.
    expect(options.find((o) => o.id === "v2")!.label).toBe("v2");
  });

  it("returns [] for undefined meta", () => {
    expect(assigneeOptions(undefined)).toEqual([]);
  });
});

describe("buildAssigneeRows / assigneeRowKey", () => {
  const options = [
    { id: "v1", label: "Dr. Bruce", role: "vet", onShift: true },
    { id: "v2", label: "v2", role: "vet", onShift: true },
    { id: "t3", label: "Cara", role: "technician", onShift: false },
  ] as const;

  it("prepends the unassigned sentinel then one row per staffer, order preserved", () => {
    const rows = buildAssigneeRows(options);
    expect(rows).toHaveLength(options.length + 1);
    expect(rows[0]).toEqual({ kind: "unassigned" });
    expect(rows.slice(1).map((row) => (row.kind === "staff" ? row.option.id : null))).toEqual(
      options.map((o) => o.id),
    );
  });

  it("emits a stable, unique key per row (the sentinel + each option id)", () => {
    const rows = buildAssigneeRows(options);
    const keys = rows.map(assigneeRowKey);
    expect(keys[0]).toBe(UNASSIGNED_ROW_KEY);
    expect(keys.slice(1)).toEqual(options.map((o) => o.id));
    expect(new Set(keys).size).toBe(keys.length); // no collisions
  });

  it("is just the sentinel for an empty roster", () => {
    expect(buildAssigneeRows([])).toEqual([{ kind: "unassigned" }]);
  });
});

describe("mutationErrorKey", () => {
  it("maps the verified server codes to translated keys", () => {
    expect(mutationErrorKey("INVALID_TIME")).toBe("tasks.errors.invalidTime");
    expect(mutationErrorKey("TIMEZONE_REQUIRED")).toBe("tasks.errors.invalidTime");
    expect(mutationErrorKey("INVALID_TIME_WINDOW")).toBe("tasks.errors.invalidTime");
    expect(mutationErrorKey("APPOINTMENT_CONFLICT")).toBe("tasks.errors.conflict");
    expect(mutationErrorKey("OUTSIDE_SHIFT")).toBe("tasks.errors.outsideShift");
    expect(mutationErrorKey("VET_NOT_IN_CLINIC")).toBe("tasks.errors.assigneeInvalid");
    expect(mutationErrorKey("INVALID_STATUS_TRANSITION")).toBe("tasks.errors.invalidTransition");
    expect(mutationErrorKey("APPOINTMENT_NOT_FOUND")).toBe("tasks.errors.notFound");
    expect(mutationErrorKey("IDEMPOTENCY_CONFLICT")).toBe("tasks.errors.alreadyApplied");
    expect(mutationErrorKey("INSUFFICIENT_ROLE")).toBe("tasks.errors.offShift");
    expect(mutationErrorKey("VALIDATION_FAILED")).toBe("tasks.errors.invalidForm");
    expect(mutationErrorKey("UNASSIGNED_TASK_STATUS")).toBe("tasks.errors.invalidForm");
  });

  it("degrades an unmapped code to the generic key", () => {
    expect(mutationErrorKey("SOMETHING_NEW")).toBe("common.errorGeneric");
  });
});
