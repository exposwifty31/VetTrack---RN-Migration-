/**
 * Mirrors the server task-RBAC table VERBATIM (vettrack server/lib/task-rbac.ts,
 * read 2026-08-07). The client pre-gates affordances on the SAME decisions the
 * server enforces — any drift here shows a 403 the UI did not predict.
 *
 * Server truth being locked:
 *   admin             → everything
 *   vet / senior_technician → read, create, assign, reassign, cancel (NOT start/complete)
 *   technician        → read, start, complete (NOT create)
 *   student / unknown (incl. lead_technician, vet_tech) → nothing
 *   "viewer" is a legacy alias for student
 */
import { canPerformTaskAction, resolveTaskGateRole, type TaskAction } from "../task-permissions";

const ALL_ACTIONS: readonly TaskAction[] = [
  "task.read",
  "task.create",
  "task.assign",
  "task.reassign",
  "task.cancel",
  "task.start",
  "task.complete",
];

function allowedFor(role: string | null | undefined): TaskAction[] {
  return ALL_ACTIONS.filter((action) => canPerformTaskAction(role, action));
}

describe("canPerformTaskAction — server table mirror", () => {
  it("admin can do everything", () => {
    expect(allowedFor("admin")).toEqual(ALL_ACTIONS);
  });

  it.each(["vet", "senior_technician"])("%s manages but never starts/completes", (role) => {
    expect(allowedFor(role)).toEqual([
      "task.read",
      "task.create",
      "task.assign",
      "task.reassign",
      "task.cancel",
    ]);
  });

  it("technician reads + runs the lifecycle but never creates", () => {
    expect(allowedFor("technician")).toEqual(["task.read", "task.start", "task.complete"]);
  });

  it.each(["student", "viewer", "lead_technician", "vet_tech", "", "nope", null, undefined])(
    "%s gets nothing (unknown roles deny — matches the server fall-through)",
    (role) => {
      expect(allowedFor(role)).toEqual([]);
    },
  );

  it("normalizes case and whitespace like the server", () => {
    expect(canPerformTaskAction("  TECHNICIAN ", "task.start")).toBe(true);
    expect(canPerformTaskAction("Viewer", "task.read")).toBe(false);
  });
});

describe("resolveTaskGateRole — mirrors resolveTaskAuthRole", () => {
  it("base-role admin wins over any effectiveRole", () => {
    expect(resolveTaskGateRole({ role: "admin", effectiveRole: "student" })).toBe("admin");
  });

  it("otherwise the roster-derived effectiveRole is the gate role", () => {
    expect(resolveTaskGateRole({ role: "technician", effectiveRole: "senior_technician" })).toBe(
      "senior_technician",
    );
    expect(resolveTaskGateRole({ role: "vet", effectiveRole: "student" })).toBe("student");
  });

  it("nullish-falls-back to the base role (verbatim ?? — empty string does NOT fall back)", () => {
    expect(resolveTaskGateRole({ role: "technician", effectiveRole: null })).toBe("technician");
    expect(resolveTaskGateRole({ role: "technician", effectiveRole: "" })).toBe("");
    expect(resolveTaskGateRole({ effectiveRole: undefined })).toBe("");
  });
});
