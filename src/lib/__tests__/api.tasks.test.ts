/**
 * Shape tests for the tasks API module (Slice 3). `authFetch` is mocked with
 * crafted Responses to lock: day-param building, response unwrapping, the
 * verified `Idempotency-Key` header sourcing on lifecycle mutations (server
 * `idempotencyMiddleware(scope)` reads the OPTIONAL `Idempotency-Key` request
 * header — verified against server/middleware/idempotency.ts), and the
 * 403 `INSUFFICIENT_ROLE` → off-shift mapping (which must NOT swallow the
 * ownership 403 `TASK_NOT_OWNED_BY_TECH`).
 */
import {
  TASK_AUDIT_ACTION_TYPES,
  TASK_EVENT_TYPE_PREFIXES,
  TasksApiError,
  isOffShiftError,
  taskKeys,
  tasksApi,
} from "../api/tasks";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-idempotency-uuid" }));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

const TASK = {
  id: "task-1",
  vetId: "user-1",
  startTime: "2026-08-07T06:00:00.000Z",
  endTime: "2026-08-07T07:00:00.000Z",
  status: "scheduled",
  priority: "normal",
  taskType: "maintenance",
  notes: "check the pump",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("taskKeys", () => {
  it("nests day and mine keys under the canonical root", () => {
    expect(taskKeys.all).toEqual(["tasks"]);
    expect(taskKeys.day("2026-08-07")).toEqual(["tasks", "day", "2026-08-07"]);
    expect(taskKeys.mine()).toEqual(["tasks", "mine"]);
  });
});

describe("tasksApi.listByDay", () => {
  it("builds the ?day= param and unwraps {appointments}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { appointments: [TASK] }));

    const tasks = await tasksApi.listByDay("2026-08-07");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/appointments?day=2026-08-07", undefined);
    expect(tasks).toEqual([TASK]);
  });

  it("URL-encodes the day value", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { appointments: [] }));

    await tasksApi.listByDay("2026-08-07&evil=1");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/appointments?day=2026-08-07%26evil%3D1");
  });

  it("throws TasksApiError carrying status + code on a non-OK response", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "INSUFFICIENT_ROLE", error: "INSUFFICIENT_ROLE" }),
    );

    await expect(tasksApi.listByDay("2026-08-07")).rejects.toMatchObject({
      status: 403,
      code: "INSUFFICIENT_ROLE",
    });
  });
});

describe("tasksApi.listMine", () => {
  it("unwraps {tasks} from /api/tasks/me", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { tasks: [TASK] }));

    const tasks = await tasksApi.listMine();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/tasks/me", undefined);
    expect(tasks).toEqual([TASK]);
  });
});

describe("lifecycle mutations", () => {
  it("POSTs start with the Idempotency-Key + x-request-id headers and unwraps {task}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { task: { ...TASK, status: "in_progress" } }));

    const task = await tasksApi.start("task-1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/tasks/task-1/start");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "test-idempotency-uuid",
    );
    expect((init.headers as Record<string, string>)["x-request-id"]).toBe("test-idempotency-uuid");
    expect(task.status).toBe("in_progress");
  });

  it("POSTs complete to the complete path with the same header contract", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { task: { ...TASK, status: "completed" } }));

    const task = await tasksApi.complete("task-1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/tasks/task-1/complete");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "test-idempotency-uuid",
    );
    expect(task.status).toBe("completed");
  });

  it("encodes the task id into the path (CWE-29 idiom)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { task: TASK }));

    await tasksApi.start("a/b?c");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/tasks/a%2Fb%3Fc/start");
  });

  it("surfaces the idempotency replay 409 as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "IDEMPOTENCY_CONFLICT", reason: "IDEMPOTENCY_REPLAY" }),
    );

    await expect(tasksApi.complete("task-1")).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("falls back to the error field, then HTTP_<status>, when code is missing", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, { error: "INTERNAL_ERROR" }));
    await expect(tasksApi.start("task-1")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    mockAuthFetch.mockResolvedValue(makeResponse(502, "not-json-shaped"));
    await expect(tasksApi.start("task-1")).rejects.toMatchObject({ code: "HTTP_502" });
  });

  it("survives a JSON null error body (still a coded TasksApiError, never a TypeError)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403, null));

    await expect(tasksApi.start("task-1")).rejects.toMatchObject({
      status: 403,
      code: "HTTP_403",
      name: "TasksApiError",
    });
  });
});

describe("isOffShiftError", () => {
  it("maps ONLY 403 INSUFFICIENT_ROLE to the off-shift state", () => {
    expect(isOffShiftError(new TasksApiError(403, "INSUFFICIENT_ROLE"))).toBe(true);
    // Ownership 403 is a different UX — never the off-shift empty state.
    expect(isOffShiftError(new TasksApiError(403, "TASK_NOT_OWNED_BY_TECH"))).toBe(false);
    expect(isOffShiftError(new TasksApiError(401, "INSUFFICIENT_ROLE"))).toBe(false);
    expect(isOffShiftError(new Error("INSUFFICIENT_ROLE"))).toBe(false);
    expect(isOffShiftError(null)).toBe(false);
  });
});

describe("realtime invalidation vocabulary", () => {
  it("locks the five verified task audit actionTypes (server appointments.service)", () => {
    // Verified against vettrack server/lib/audit.ts + appointments.service.ts:
    // auditTaskChange() logs task_created/task_updated/task_cancelled;
    // startTask/completeTask log task_started/task_completed.
    expect([...TASK_AUDIT_ACTION_TYPES].sort()).toEqual([
      "task_cancelled",
      "task_completed",
      "task_created",
      "task_started",
      "task_updated",
    ]);
  });

  it("keeps the best-effort TASK_ broadcast prefix as an additive channel", () => {
    expect(TASK_EVENT_TYPE_PREFIXES).toEqual(["TASK_"]);
  });
});
