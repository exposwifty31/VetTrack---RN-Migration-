/**
 * Start/complete mutation control extracted from the screen: fires the tasks
 * lifecycle endpoints, invalidates the canonical task keys on success, and maps
 * coded server denials to translated copy keys (inline rendering, no toast).
 */
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TasksApiError, taskKeys, tasksApi } from "@/lib/api/tasks";
import type { Task } from "@/types/tasks";

import type { TaskActionHandler } from "./TaskRow";
import {
  lifecycleErrorKey,
  type LifecycleErrorKey,
  type TaskLifecycleAction,
} from "./tasks-derive";

export type TaskLifecycleState = Readonly<{
  /** i18n key of the last failed action's copy — null when clear. */
  actionErrorKey: LifecycleErrorKey | null;
  /** Task id whose mutation is in flight — null when idle. */
  pendingTaskId: string | null;
  onAction: TaskActionHandler;
}>;

export function useTaskLifecycle(): TaskLifecycleState {
  const queryClient = useQueryClient();
  const [actionErrorKey, setActionErrorKey] = useState<LifecycleErrorKey | null>(null);

  const mutation = useMutation({
    mutationFn: ({ task, action }: { task: Task; action: TaskLifecycleAction }) =>
      action === "start" ? tasksApi.start(task.id) : tasksApi.complete(task.id),
    onMutate: () => setActionErrorKey(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onError: (error) => {
      setActionErrorKey(
        error instanceof TasksApiError ? lifecycleErrorKey(error.code) : "common.errorGeneric",
      );
    },
  });

  // `mutate` is referentially stable in TanStack v5 — the handler stays stable
  // so the FlashList renderItem does not churn.
  const { mutate } = mutation;
  const onAction = useCallback<TaskActionHandler>(
    (task, action) => {
      mutate({ task, action });
    },
    [mutate],
  );

  const pendingTaskId = mutation.isPending ? (mutation.variables?.task.id ?? null) : null;

  return { actionErrorKey, pendingTaskId, onAction };
}
