/**
 * Create / edit / cancel mutation control for the task form (Slice 3b).
 *
 * Doctrine: PLAIN invalidation, mirroring the merged 3a lifecycle hook — every
 * success invalidates the canonical `taskKeys.all`; the SSE `audit_log` channel
 * (task_created / task_updated / task_cancelled) reconciles the rest. No
 * optimistic local mutation of the day/mine caches: a failed request therefore
 * leaves the cache byte-for-byte intact (the rollback guarantee is inherent),
 * and the coded server denial renders inline via `taskErrorKey`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TasksApiError, taskKeys, tasksApi } from "@/lib/api/tasks";
import type { TaskCreateInput, TaskUpdateInput } from "@/types/tasks";

import { mutationErrorKey, type TaskMutationErrorKey } from "./task-form-derive";

/** Coded server error → translated copy key (generic fallback for non-coded). */
export function taskErrorKey(error: unknown): TaskMutationErrorKey {
  return error instanceof TasksApiError ? mutationErrorKey(error.code) : "common.errorGeneric";
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: taskKeys.all });

  const create = useMutation({
    mutationFn: (input: TaskCreateInput) => tasksApi.create(input),
    onSuccess: invalidateAll,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) =>
      tasksApi.update(id, input),
    onSuccess: invalidateAll,
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => tasksApi.cancel(id, reason),
    onSuccess: invalidateAll,
  });

  return { create, update, cancel };
}
