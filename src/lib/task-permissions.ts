/**
 * Client mirror of the server task-RBAC policy — ported VERBATIM from vettrack
 * server/lib/task-rbac.ts as of PR #171 (merge 98cbedc6, read 2026-08-07) + the
 * route-level `resolveTaskAuthRole` helper. UI affordances pre-gate on the SAME
 * decisions the server enforces, so a rendered button never predicts a 403.
 *
 * Notable server truths this preserves (do not "fix" them here):
 *   - Hierarchical superset (vettrack #171): senior roles inherit every action
 *     the technician tier has (start/complete), so a vet can always do what a
 *     technician can.
 *   - lead_technician is the senior_technician alias tier (ROLE_HIERARCHY
 *     lead=22, senior=25) and vet_tech the technician tier-20 peer.
 *   - Actions are enumerated explicitly (no blanket allow for non-admin roles)
 *     so any future TaskAction stays deny-by-default until deliberately granted.
 *   - student / unknown roles get NOTHING (the server's fall-through denies).
 *   - "viewer" is a legacy alias for student.
 *   - Ownership bypass stays admin/vet/senior only — lead_technician runs the
 *     lifecycle but only on tasks assigned to them.
 */

export type TaskAction =
  | "task.read"
  | "task.create"
  | "task.assign"
  | "task.reassign"
  | "task.cancel"
  | "task.start"
  | "task.complete";

function normalizedRole(role: string | null | undefined): string {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "viewer" ? "student" : normalized;
}

/** Verbatim decision table — keep in lockstep with the server. */
export function canPerformTaskAction(
  roleInput: string | null | undefined,
  action: TaskAction,
): boolean {
  const role = normalizedRole(roleInput);

  if (role === "admin") return true;

  if (role === "vet" || role === "senior_technician" || role === "lead_technician") {
    return (
      action === "task.read" ||
      action === "task.create" ||
      action === "task.assign" ||
      action === "task.reassign" ||
      action === "task.cancel" ||
      action === "task.start" ||
      action === "task.complete"
    );
  }

  if (role === "technician" || role === "vet_tech") {
    return action === "task.read" || action === "task.start" || action === "task.complete";
  }

  if (role === "student") {
    return false;
  }

  return false;
}

/**
 * Mirror of the routes' `resolveTaskAuthRole`: base-role admins gate as admin
 * regardless of roster state; everyone else gates on the roster-derived
 * `effectiveRole` (nullish-falling-back to the base role, verbatim `??` — an
 * EMPTY effectiveRole therefore denies everything, the safe direction).
 */
export function resolveTaskGateRole(me: {
  role?: string | null;
  effectiveRole: string | null | undefined;
}): string {
  if (me.role === "admin") return "admin";
  return me.effectiveRole ?? me.role ?? "";
}

/**
 * Ownership bypass for lifecycle actions — mirror of the service's
 * `canBypassOwnership` (appointments.service.ts startTask/completeTask):
 * admin/vet/senior only. lead_technician is deliberately absent (vettrack
 * #171 kept it out) — leads reach start/complete via the route RBAC above but
 * only on tasks assigned to them, with no supervisor override.
 */
export function canBypassTaskOwnership(roleInput: string | null | undefined): boolean {
  const role = normalizedRole(roleInput);
  return role === "admin" || role === "vet" || role === "senior_technician";
}
