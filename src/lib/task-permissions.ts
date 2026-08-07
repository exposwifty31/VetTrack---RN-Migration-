/**
 * Client mirror of the server task-RBAC policy — ported VERBATIM from vettrack
 * server/lib/task-rbac.ts + the route-level `resolveTaskAuthRole` helper
 * (read 2026-08-07). UI affordances pre-gate on the SAME decisions the server
 * enforces, so a rendered button never predicts a 403.
 *
 * Notable server truths this preserves (do not "fix" them here):
 *   - vet / senior_technician manage tasks but can NOT start/complete them.
 *   - technician runs the lifecycle but can NOT create.
 *   - lead_technician / vet_tech / student / unknown roles get NOTHING (the
 *     server's fall-through denies them).
 *   - "viewer" is a legacy alias for student.
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

  if (role === "vet" || role === "senior_technician") {
    return (
      action === "task.read" ||
      action === "task.create" ||
      action === "task.assign" ||
      action === "task.reassign" ||
      action === "task.cancel"
    );
  }

  if (role === "technician") {
    return action === "task.read" || action === "task.start" || action === "task.complete";
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
 * `canBypassOwnership` (startTask/completeTask). vet/senior appear here for
 * fidelity but are unreachable through the route RBAC above.
 */
export function canBypassTaskOwnership(roleInput: string | null | undefined): boolean {
  const role = normalizedRole(roleInput);
  return role === "admin" || role === "vet" || role === "senior_technician";
}
