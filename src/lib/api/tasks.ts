/**
 * Tasks API module — the first per-domain module under `src/lib/api/` (G3-PLAN
 * §2 rule 3: new domains never grow `api.ts`; each ships its own key factory +
 * typed fns following the api.ts idioms).
 *
 * Server truth (verified 2026-08-07 against the vettrack repo, read-only):
 *   - Routes live under the FROZEN `/api/appointments` namespace (list/create/
 *     update/cancel) + `/api/tasks/*` (dashboard/me/active/lifecycle). Floor is
 *     `requireEffectiveRole("technician")` + task-RBAC — an off-shift user
 *     resolves below the floor and receives 403 `INSUFFICIENT_ROLE`.
 *   - Idempotency (seam §6.7 RESOLVED): `idempotencyMiddleware(scope)` reads
 *     the OPTIONAL `Idempotency-Key` request HEADER (not body, not x-request-id)
 *     and scopes it `${scope}:${clinicId}:${userId}:${header}`. A replayed key
 *     after a 2xx returns 409 {code: "IDEMPOTENCY_CONFLICT", reason:
 *     "IDEMPOTENCY_REPLAY"} within TTL. We mint one UUID per mutation attempt;
 *     any future offline-replay layer must PRESERVE the attempt's key.
 *   - Errors ride the apiError envelope {code, error, reason, message} —
 *     surfaced here as TasksApiError so screens can branch on `code`
 *     (403 INSUFFICIENT_ROLE → off-shift empty state; 403 TASK_NOT_OWNED_BY_TECH
 *     → ownership copy — same status, different UX).
 */
import * as Crypto from "expo-crypto";

import { authFetch } from "@/lib/auth-fetch";
import type {
  Task,
  TaskCreateInput,
  TaskMeta,
  TaskUpdateInput,
} from "@/types/tasks";

/** Canonical tasks query-key factory — everything nests under `all`. */
export const taskKeys = {
  all: ["tasks"] as const,
  day: (day: string) => ["tasks", "day", day] as const,
  mine: () => ["tasks", "mine"] as const,
  dashboard: () => ["tasks", "dashboard"] as const,
  meta: (day: string) => ["tasks", "meta", day] as const,
};

/**
 * Audit actionTypes that mean "task state changed" — verified against
 * server/services/appointments.service.ts (auditTaskChange + startTask/
 * completeTask) and the closed AuditActionType union in server/lib/audit.ts.
 * Tasks emit no dedicated outbox domain events; these `audit_log` rows are the
 * guaranteed SSE invalidation channel.
 */
export const TASK_AUDIT_ACTION_TYPES = [
  "task_created",
  "task_updated",
  "task_started",
  "task_completed",
  "task_cancelled",
] as const;

/**
 * Best-effort additive channel: the appointments service also `broadcast()`s
 * TASK_STARTED/TASK_UPDATED/… envelopes to connected SSE clients WITHOUT outbox
 * persistence (server/lib/realtime.ts). When they arrive they lower latency;
 * when they don't, the audit_log path above still invalidates.
 */
export const TASK_EVENT_TYPE_PREFIXES = ["TASK_"] as const;

/** Coded error for the tasks domain — screens branch on `code`, never on copy. */
export class TasksApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `${code} (HTTP ${status})`);
    this.name = "TasksApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * The roster-derived off-shift signal — 403 INSUFFICIENT_ROLE from the
 * technician floor. Deliberately narrow: ownership 403s
 * (TASK_NOT_OWNED_BY_TECH) and auth 401s are different states.
 */
export function isOffShiftError(error: unknown): boolean {
  return (
    error instanceof TasksApiError && error.status === 403 && error.code === "INSUFFICIENT_ROLE"
  );
}

/** Query retry policy: default-retry parity (retry: 1) minus pointless 4xx retries. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof TasksApiError && error.status < 500) return false;
  return failureCount < 1;
}

async function requestTasksJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    // Normalize before reading fields: a JSON `null` (or non-object) body must
    // still surface a coded TasksApiError, never a TypeError.
    const payload: unknown = await res.json().catch(() => ({}));
    const body =
      payload !== null && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const code =
      typeof body.code === "string"
        ? body.code
        : typeof body.error === "string"
          ? body.error
          : `HTTP_${res.status}`;
    const message = typeof body.message === "string" ? body.message : undefined;
    throw new TasksApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

/** One fresh key per mutation attempt (see the idempotency note above). */
function lifecycleHeaders(): Record<string, string> {
  const requestId = Crypto.randomUUID();
  return { "Idempotency-Key": requestId, "x-request-id": requestId };
}

/**
 * Headers for a body-carrying mutation (create/update): the idempotency pair
 * PLUS `Content-Type: application/json`. `authFetch` does NOT set the content
 * type — omit it and Express leaves `req.body` unparsed → 400 VALIDATION_FAILED
 * (the shift-adjustments create idiom). One fresh idempotency key per attempt;
 * a future offline-replay layer must preserve the attempt's key.
 */
function jsonMutationHeaders(): Record<string, string> {
  const requestId = Crypto.randomUUID();
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": requestId,
    "x-request-id": requestId,
  };
}

/**
 * GET /api/tasks/dashboard counts (G3 Slice 5 additive — the home tasks chip).
 * The full payload (server/services/task-recall.service.ts
 * `TaskDashboardPayload`) also carries today/overdue/upcoming/myTasks item
 * lists; the chip consumes `counts` only, so only that field is typed here —
 * extend when a consumer needs the lists (3b's concern), never re-declare.
 */
export type TasksDashboardCounts = Readonly<{
  today: number;
  overdue: number;
  myTasks: number;
}>;

export type TasksDashboard = Readonly<{ counts: TasksDashboardCounts }>;

export const tasksApi = {
  /** GET /api/appointments?day=YYYY-MM-DD — the clinic-timezone day window. */
  listByDay: async (day: string): Promise<Task[]> => {
    const body = await requestTasksJson<{ appointments: Task[] }>(
      `/api/appointments?day=${encodeURIComponent(day)}`,
    );
    return body.appointments;
  },

  /** GET /api/tasks/me — MY tasks for the clinic's TODAY (server-scoped). */
  listMine: async (): Promise<Task[]> => {
    const body = await requestTasksJson<{ tasks: Task[] }>("/api/tasks/me");
    return body.tasks;
  },

  /**
   * GET /api/tasks/dashboard — technician+ floor (an off-shift caller gets
   * 403 INSUFFICIENT_ROLE → map via isOffShiftError, same as the lists).
   */
  getTasksDashboard: async (): Promise<TasksDashboard> =>
    requestTasksJson<TasksDashboard>("/api/tasks/dashboard"),

  /** POST /api/tasks/:id/start — idempotency scope `tasks:start`. */
  start: async (taskId: string): Promise<Task> => {
    const body = await requestTasksJson<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/start`,
      { method: "POST", headers: lifecycleHeaders() },
    );
    return body.task;
  },

  /** POST /api/tasks/:id/complete — idempotency scope `tasks:complete`. */
  complete: async (taskId: string): Promise<Task> => {
    const body = await requestTasksJson<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/complete`,
      { method: "POST", headers: lifecycleHeaders() },
    );
    return body.task;
  },

  /**
   * GET /api/appointments/meta?day=YYYY-MM-DD — vets/technicians (+ that day's
   * roster shifts) for the assignee picker. technician+ floor & task.read RBAC;
   * an off-shift caller gets 403 INSUFFICIENT_ROLE like the lists.
   */
  getMeta: async (day: string): Promise<TaskMeta> =>
    requestTasksJson<TaskMeta>(`/api/appointments/meta?day=${encodeURIComponent(day)}`),

  /**
   * POST /api/appointments — create a task. 201 `{appointment}`. technician+
   * floor + task.create RBAC (+ task.assign when `vetId` is set); idempotency
   * scope `appointments:create` via the `Idempotency-Key` header.
   */
  create: async (input: TaskCreateInput): Promise<Task> => {
    const body = await requestTasksJson<{ appointment: Task }>("/api/appointments", {
      method: "POST",
      headers: jsonMutationHeaders(),
      body: JSON.stringify(input),
    });
    return body.appointment;
  },

  /**
   * PATCH /api/appointments/:id — partial edit (server requires ≥1 field; send
   * only the diff). task.create RBAC (+ task.reassign when `vetId` is present,
   * task.cancel when moving to `cancelled`); scope `appointments:update`.
   */
  update: async (taskId: string, input: TaskUpdateInput): Promise<Task> => {
    const body = await requestTasksJson<{ appointment: Task }>(
      `/api/appointments/${encodeURIComponent(taskId)}`,
      { method: "PATCH", headers: jsonMutationHeaders(), body: JSON.stringify(input) },
    );
    return body.appointment;
  },

  /**
   * DELETE /api/appointments/:id — cancel with an optional `{reason}`. task.cancel
   * RBAC. No idempotency middleware server-side, but the JSON body still needs
   * `Content-Type` or the reason is dropped; `x-request-id` for tracing.
   */
  cancel: async (taskId: string, reason?: string): Promise<Task> => {
    const trimmed = reason?.trim();
    const init: RequestInit = trimmed
      ? {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "x-request-id": Crypto.randomUUID() },
          body: JSON.stringify({ reason: trimmed }),
        }
      : { method: "DELETE", headers: { "x-request-id": Crypto.randomUUID() } };
    const body = await requestTasksJson<{ appointment: Task }>(
      `/api/appointments/${encodeURIComponent(taskId)}`,
      init,
    );
    return body.appointment;
  },
};
