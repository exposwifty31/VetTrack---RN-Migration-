/**
 * Pure task-row derivations — the equipment-row-status pattern: colocated with
 * the row component, zero RN imports, unit-tested without the component tree.
 *
 * Lifecycle gating mirrors the VERIFIED server semantics (appointments.service
 * startTask/completeTask, 2026-08-07): route RBAC (task.start/task.complete)
 * × assignment (vetId non-null) × ownership (assignee, admin-family bypass) ×
 * status transition ({scheduled,assigned,arrived,approved}→start,
 * in_progress→complete).
 */
import type { ChipTone } from "@/components/ui/chip-tone";
import {
  canBypassTaskOwnership,
  canPerformTaskAction,
} from "@/lib/task-permissions";
import type { Task } from "@/types/tasks";

export const START_ELIGIBLE_STATUSES = ["scheduled", "assigned", "arrived", "approved"] as const;

export function canStartFromStatus(status: string): boolean {
  return (START_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export function canCompleteFromStatus(status: string): boolean {
  return status === "in_progress";
}

export type TaskLifecycleAction = "start" | "complete";

type LifecycleTask = Pick<Task, "status" | "vetId"> & { startTime?: string };

/**
 * The single row affordance: "start" | "complete" | null. Every branch mirrors
 * a specific server denial so the UI never renders a button the server 403s:
 * RBAC → 403 INSUFFICIENT_ROLE, no assignee → 400 TASK_NOT_ASSIGNED,
 * non-owner → 403 TASK_NOT_OWNED_BY_TECH, wrong status → 400
 * INVALID_STATUS_TRANSITION.
 */
export function taskLifecycleAction(
  task: LifecycleTask,
  meUserId: string | null | undefined,
  gateRole: string | null | undefined,
): TaskLifecycleAction | null {
  const action = canStartFromStatus(task.status)
    ? ("start" as const)
    : canCompleteFromStatus(task.status)
      ? ("complete" as const)
      : null;
  if (action == null) return null;
  if (!canPerformTaskAction(gateRole, action === "start" ? "task.start" : "task.complete")) {
    return null;
  }
  if (!task.vetId) return null;
  if (task.vetId !== meUserId && !canBypassTaskOwnership(gateRole)) return null;
  return action;
}

/** Status → semantic tone. Routine states stay neutral; danger is reserved. */
export function statusTone(status: string): ChipTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "pending":
      return "warning";
    case "cancelled":
    case "no_show":
      return "stale";
    default:
      return "neutral";
  }
}

/** Priority → tone: only `critical` earns the danger family. */
export function priorityTone(priority: string | null | undefined): ChipTone {
  switch (priority) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    default:
      return "neutral";
  }
}

const STATUS_LABEL_KEYS = {
  pending: "tasks.status.pending",
  assigned: "tasks.status.assigned",
  scheduled: "tasks.status.scheduled",
  arrived: "tasks.status.arrived",
  approved: "tasks.status.approved",
  in_progress: "tasks.status.in_progress",
  completed: "tasks.status.completed",
  cancelled: "tasks.status.cancelled",
  no_show: "tasks.status.no_show",
} as const;

export type TaskStatusLabelKey = (typeof STATUS_LABEL_KEYS)[keyof typeof STATUS_LABEL_KEYS];

/** Typed i18n key for a known status; null lets the caller fall back honestly. */
export function statusLabelKey(status: string): TaskStatusLabelKey | null {
  return (STATUS_LABEL_KEYS as Record<string, TaskStatusLabelKey>)[status] ?? null;
}

const TASK_TYPE_LABEL_KEYS = {
  maintenance: "tasks.taskType.maintenance",
  repair: "tasks.taskType.repair",
  inspection: "tasks.taskType.inspection",
} as const;

export type TaskTypeLabelKey = (typeof TASK_TYPE_LABEL_KEYS)[keyof typeof TASK_TYPE_LABEL_KEYS];

export function taskTypeLabelKey(taskType: string | null | undefined): TaskTypeLabelKey | null {
  if (!taskType) return null;
  return (TASK_TYPE_LABEL_KEYS as Record<string, TaskTypeLabelKey>)[taskType] ?? null;
}

const PRIORITY_LABEL_KEYS = {
  critical: "tasks.priority.critical",
  high: "tasks.priority.high",
} as const;

export type TaskPriorityLabelKey = (typeof PRIORITY_LABEL_KEYS)[keyof typeof PRIORITY_LABEL_KEYS];

/** Only critical/high get a chip — `normal` is visual noise on every row. */
export function priorityLabelKey(
  priority: string | null | undefined,
): TaskPriorityLabelKey | null {
  if (!priority) return null;
  return (PRIORITY_LABEL_KEYS as Record<string, TaskPriorityLabelKey>)[priority] ?? null;
}

const LIFECYCLE_ERROR_KEYS = {
  TASK_NOT_OWNED_BY_TECH: "tasks.errors.notOwned",
  INVALID_STATUS_TRANSITION: "tasks.errors.invalidTransition",
  TASK_NOT_ASSIGNED: "tasks.errors.notAssigned",
  IDEMPOTENCY_CONFLICT: "tasks.errors.alreadyApplied",
  INSUFFICIENT_ROLE: "tasks.errors.offShift",
} as const;

export type LifecycleErrorKey =
  | (typeof LIFECYCLE_ERROR_KEYS)[keyof typeof LIFECYCLE_ERROR_KEYS]
  | "common.errorGeneric";

/** Verified server error code → translated copy key (generic fallback). */
export function lifecycleErrorKey(code: string): LifecycleErrorKey {
  return (
    (LIFECYCLE_ERROR_KEYS as Record<string, LifecycleErrorKey>)[code] ?? "common.errorGeneric"
  );
}

/**
 * Stable ascending copy-sort by startTime (server already orders; this defends
 * cache merges). Unparseable times sink to the end.
 */
export function sortByStartTime<T extends Pick<Task, "startTime">>(tasks: readonly T[]): T[] {
  const timeOf = (t: T): number => {
    const ms = Date.parse(t.startTime);
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  };
  return [...tasks].sort((a, b) => timeOf(a) - timeOf(b));
}
