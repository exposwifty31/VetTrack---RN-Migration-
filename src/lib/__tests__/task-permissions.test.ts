/**
 * Mirrors the server task-RBAC table VERBATIM (vettrack server/lib/task-rbac.ts
 * as of PR #171, merge 98cbedc6, read 2026-08-07). The client pre-gates
 * affordances on the SAME decisions the server enforces — any drift here shows
 * a 403 the UI did not predict.
 *
 * Server truth being locked (hierarchical superset, 2026-08-07):
 *   admin → everything
 *   vet / senior_technician / lead_technician → read, create, assign,
 *     reassign, cancel, start, complete (seniors inherit the lifecycle)
 *   technician / vet_tech → read, start, complete (NOT create)
 *   student / unknown → nothing; "viewer" is a legacy alias for student
 *   ownership bypass → admin/vet/senior only (lead_technician does NOT bypass)
 */
import {
  canBypassTaskOwnership,
  canPerformTaskAction,
  resolveTaskGateRole,
  type TaskAction,
} from "../task-permissions";

const ALL_ACTIONS: readonly TaskAction[] = [
  "task.read",
  "task.create",
  "task.assign",
  "task.reassign",
  "task.cancel",
  "task.start",
  "task.complete",
];

const LIFECYCLE_ONLY: readonly TaskAction[] = ["task.read", "task.start", "task.complete"];

function allowedFor(role: string | null | undefined): TaskAction[] {
  return ALL_ACTIONS.filter((action) => canPerformTaskAction(role, action));
}

describe("canPerformTaskAction — server table mirror (every role × every action)", () => {
  it("admin can do everything", () => {
    expect(allowedFor("admin")).toEqual(ALL_ACTIONS);
  });

  it.each(["vet", "senior_technician", "lead_technician"])(
    "%s manages AND runs the lifecycle — the hierarchical superset of the technician tier",
    (role) => {
      expect(allowedFor(role)).toEqual(ALL_ACTIONS);
    },
  );

  it.each(["technician", "vet_tech"])(
    "%s reads and runs the lifecycle but never creates, assigns, reassigns, or cancels",
    (role) => {
      expect(allowedFor(role)).toEqual(LIFECYCLE_ONLY);
    },
  );

  it.each(["student", "viewer", "", "nope", null, undefined])(
    "%s gets nothing (unknown roles deny — matches the server fall-through)",
    (role) => {
      expect(allowedFor(role)).toEqual([]);
    },
  );

  it("normalizes case and whitespace like the server", () => {
    expect(canPerformTaskAction("  TECHNICIAN ", "task.start")).toBe(true);
    expect(canPerformTaskAction("  Lead_Technician ", "task.complete")).toBe(true);
    expect(canPerformTaskAction("Viewer", "task.read")).toBe(false);
  });
});

describe("canBypassTaskOwnership — mirrors the service's canBypassOwnership", () => {
  it.each(["admin", "vet", "senior_technician"])(
    "%s may run the lifecycle on tasks assigned to someone else",
    (role) => {
      expect(canBypassTaskOwnership(role)).toBe(true);
    },
  );

  it.each(["lead_technician", "vet_tech", "technician", "student", "viewer", "", null, undefined])(
    "%s must be the assignee — no supervisor override (vettrack #171 kept bypass at admin/vet/senior)",
    (role) => {
      expect(canBypassTaskOwnership(role)).toBe(false);
    },
  );
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
