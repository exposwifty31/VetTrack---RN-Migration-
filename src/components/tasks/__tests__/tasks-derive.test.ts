/**
 * Pure derivation tests for the task row: lifecycle gating (RBAC × ownership ×
 * status — mirrors the verified server semantics of startTask/completeTask),
 * chip tones, and error-code → i18n-key mapping.
 */
import {
  canCompleteFromStatus,
  canStartFromStatus,
  lifecycleErrorKey,
  priorityTone,
  sortByStartTime,
  statusLabelKey,
  statusTone,
  taskLifecycleAction,
  taskTypeLabelKey,
} from "../tasks-derive";

const BASE = { id: "t1", startTime: "2026-08-07T06:00:00.000Z", endTime: "2026-08-07T07:00:00.000Z" };

describe("status transitions (server mirror)", () => {
  it("start is allowed only from the four pre-work statuses", () => {
    for (const s of ["scheduled", "assigned", "arrived", "approved"]) {
      expect(canStartFromStatus(s)).toBe(true);
    }
    for (const s of ["pending", "in_progress", "completed", "cancelled", "no_show", "weird"]) {
      expect(canStartFromStatus(s)).toBe(false);
    }
  });

  it("complete is allowed only from in_progress", () => {
    expect(canCompleteFromStatus("in_progress")).toBe(true);
    expect(canCompleteFromStatus("scheduled")).toBe(false);
    expect(canCompleteFromStatus("completed")).toBe(false);
  });
});

describe("taskLifecycleAction — RBAC × ownership × status", () => {
  it("assigned technician can start a scheduled task", () => {
    expect(
      taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "me" }, "me", "technician"),
    ).toBe("start");
  });

  it("assigned technician can complete an in_progress task", () => {
    expect(
      taskLifecycleAction({ ...BASE, status: "in_progress", vetId: "me" }, "me", "technician"),
    ).toBe("complete");
  });

  it("a technician who is not the assignee gets no affordance (TASK_NOT_OWNED_BY_TECH)", () => {
    expect(
      taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "other" }, "me", "technician"),
    ).toBeNull();
  });

  it("an unassigned task offers no lifecycle action (TASK_NOT_ASSIGNED)", () => {
    expect(
      taskLifecycleAction({ ...BASE, status: "scheduled", vetId: null }, "me", "technician"),
    ).toBeNull();
  });

  it("admin bypasses ownership", () => {
    expect(
      taskLifecycleAction({ ...BASE, status: "in_progress", vetId: "other" }, "me", "admin"),
    ).toBe("complete");
  });

  it("vet and senior_technician run the lifecycle and bypass ownership (vettrack #171 hierarchical superset)", () => {
    for (const role of ["vet", "senior_technician"]) {
      expect(taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "me" }, "me", role)).toBe("start");
      expect(taskLifecycleAction({ ...BASE, status: "in_progress", vetId: "other" }, "me", role)).toBe(
        "complete",
      );
    }
  });

  it("lead_technician runs the lifecycle on their own tasks only — no ownership bypass", () => {
    expect(taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "me" }, "me", "lead_technician")).toBe(
      "start",
    );
    expect(
      taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "other" }, "me", "lead_technician"),
    ).toBeNull();
  });

  it("vet_tech mirrors the technician tier — own tasks only", () => {
    expect(taskLifecycleAction({ ...BASE, status: "in_progress", vetId: "me" }, "me", "vet_tech")).toBe(
      "complete",
    );
    expect(
      taskLifecycleAction({ ...BASE, status: "in_progress", vetId: "other" }, "me", "vet_tech"),
    ).toBeNull();
  });

  it("students and off-roster roles get nothing", () => {
    expect(taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "me" }, "me", "student")).toBeNull();
    expect(taskLifecycleAction({ ...BASE, status: "scheduled", vetId: "me" }, "me", undefined)).toBeNull();
  });

  it("terminal or unknown statuses offer nothing regardless of role", () => {
    expect(taskLifecycleAction({ ...BASE, status: "completed", vetId: "me" }, "me", "admin")).toBeNull();
    expect(taskLifecycleAction({ ...BASE, status: "mystery", vetId: "me" }, "me", "admin")).toBeNull();
  });
});

describe("tones + label keys", () => {
  it("maps statuses to semantic tones (danger family never used for routine states)", () => {
    expect(statusTone("completed")).toBe("success");
    expect(statusTone("in_progress")).toBe("info");
    expect(statusTone("pending")).toBe("warning");
    expect(statusTone("cancelled")).toBe("stale");
    expect(statusTone("no_show")).toBe("stale");
    expect(statusTone("scheduled")).toBe("neutral");
    expect(statusTone("unknown-thing")).toBe("neutral");
  });

  it("maps priorities to tones — only critical is danger", () => {
    expect(priorityTone("critical")).toBe("danger");
    expect(priorityTone("high")).toBe("warning");
    expect(priorityTone("normal")).toBe("neutral");
    expect(priorityTone(undefined)).toBe("neutral");
  });

  it("returns typed i18n keys for known statuses and null for unknown", () => {
    expect(statusLabelKey("in_progress")).toBe("tasks.status.in_progress");
    expect(statusLabelKey("no_show")).toBe("tasks.status.no_show");
    expect(statusLabelKey("whatever")).toBeNull();
  });

  it("returns typed i18n keys for known task types and null otherwise", () => {
    expect(taskTypeLabelKey("maintenance")).toBe("tasks.taskType.maintenance");
    expect(taskTypeLabelKey(null)).toBeNull();
    expect(taskTypeLabelKey("medication")).toBeNull();
  });
});

describe("lifecycleErrorKey", () => {
  it("maps the verified server error codes to translated copy", () => {
    expect(lifecycleErrorKey("TASK_NOT_OWNED_BY_TECH")).toBe("tasks.errors.notOwned");
    expect(lifecycleErrorKey("INVALID_STATUS_TRANSITION")).toBe("tasks.errors.invalidTransition");
    expect(lifecycleErrorKey("TASK_NOT_ASSIGNED")).toBe("tasks.errors.notAssigned");
    expect(lifecycleErrorKey("IDEMPOTENCY_CONFLICT")).toBe("tasks.errors.alreadyApplied");
    expect(lifecycleErrorKey("INSUFFICIENT_ROLE")).toBe("tasks.errors.offShift");
    expect(lifecycleErrorKey("SOMETHING_ELSE")).toBe("common.errorGeneric");
  });
});

describe("sortByStartTime", () => {
  it("returns a new array sorted ascending, tolerating unparseable times", () => {
    const a = { ...BASE, id: "a", startTime: "2026-08-07T09:00:00.000Z", status: "scheduled", vetId: null };
    const b = { ...BASE, id: "b", startTime: "2026-08-07T06:00:00.000Z", status: "scheduled", vetId: null };
    const c = { ...BASE, id: "c", startTime: "not-a-date", status: "scheduled", vetId: null };
    const input = [a, c, b];
    const sorted = sortByStartTime(input);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(input.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
