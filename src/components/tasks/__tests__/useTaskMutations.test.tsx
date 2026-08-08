/**
 * useTaskMutations (Slice 3b) — PLAIN-invalidate contract + the rollback
 * guarantee. On success each mutation invalidates the canonical `taskKeys.all`;
 * on failure it surfaces the coded error and — because nothing was mutated
 * optimistically — leaves any seeded cache byte-for-byte intact (the rollback).
 * `authFetch` + `expo-crypto` are mocked so the real `tasksApi` drives the hook.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TasksApiError, taskKeys } from "@/lib/api/tasks";

import { taskErrorKey, useTaskMutations } from "../useTaskMutations";

jest.mock("expo-crypto", () => ({ randomUUID: () => "u" }));

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
  vetId: null,
  startTime: "2026-08-07T06:00:00.000Z",
  endTime: "2026-08-07T07:00:00.000Z",
  status: "pending",
};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

async function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const view = await renderHook(() => useTaskMutations(), { wrapper: makeWrapper(queryClient) });
  return { queryClient, invalidateSpy, view };
}

afterEach(() => mockAuthFetch.mockReset());

describe("useTaskMutations — success invalidates taskKeys.all", () => {
  it("create invalidates the canonical root on 201", async () => {
    const { invalidateSpy, view } = await setup();
    mockAuthFetch.mockResolvedValue(makeResponse(201, { appointment: TASK }));

    await act(async () => {
      view.result.current.create.mutate({ startTime: "a", endTime: "b" });
    });
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });

  it("update invalidates the canonical root", async () => {
    const { invalidateSpy, view } = await setup();
    mockAuthFetch.mockResolvedValue(makeResponse(200, { appointment: TASK }));

    await act(async () => {
      view.result.current.update.mutate({ id: "task-1", input: { notes: "x" } });
    });
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });

  it("cancel invalidates the canonical root", async () => {
    const { invalidateSpy, view } = await setup();
    mockAuthFetch.mockResolvedValue(makeResponse(200, { appointment: { ...TASK, status: "cancelled" } }));

    await act(async () => {
      view.result.current.cancel.mutate({ id: "task-1", reason: "broken" });
    });
    await waitFor(() => expect(view.result.current.cancel.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
  });
});

describe("useTaskMutations — failure rolls back (cache untouched, coded error)", () => {
  it("a failed create leaves a seeded day cache intact and never invalidates", async () => {
    const { queryClient, invalidateSpy, view } = await setup();
    queryClient.setQueryData(taskKeys.day("2026-08-07"), [TASK]);
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "APPOINTMENT_CONFLICT", reason: "APPOINTMENT_CONFLICT" }),
    );

    await act(async () => {
      view.result.current.create.mutate({ startTime: "a", endTime: "b" });
    });
    await waitFor(() => expect(view.result.current.create.isError).toBe(true));

    // Rollback guarantee: no optimistic write means the cache is unchanged.
    expect(queryClient.getQueryData(taskKeys.day("2026-08-07"))).toEqual([TASK]);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(view.result.current.create.error).toBeInstanceOf(TasksApiError);
    expect(taskErrorKey(view.result.current.create.error)).toBe("tasks.errors.conflict");
  });
});

describe("taskErrorKey", () => {
  it("maps a coded TasksApiError and degrades a non-coded error to the generic key", () => {
    expect(taskErrorKey(new TasksApiError(403, "INSUFFICIENT_ROLE"))).toBe("tasks.errors.offShift");
    expect(taskErrorKey(new Error("boom"))).toBe("common.errorGeneric");
    expect(taskErrorKey(null)).toBe("common.errorGeneric");
  });
});
