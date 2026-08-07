/**
 * Tasks — G3 Slice 3a: clinic day view + "mine" segment + day navigation +
 * start/complete lifecycle. (3b — create/edit via BottomSheet + /meta assignee
 * picker — is the declared remainder; this screen keeps ZERO blur layers until
 * that sheet lands.)
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the five verified
 *     task audit actionTypes (+ the best-effort TASK_ broadcast prefix). No
 *     polling, no refetchInterval. The `useTaskDay` AppState listener is clock
 *     state only (day rollover), never a data fetch trigger.
 *   - Off-shift 403 INSUFFICIENT_ROLE renders the dedicated empty state —
 *     never an error surface (G3-PLAN §1.6).
 *   - Rows are opaque; the only motion is PressableScale press feedback.
 *
 * The screen is a thin composition layer; day/lifecycle control live in
 * feature hooks and the state ladder in `TasksListContent`.
 */
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TasksDayNav } from "@/components/tasks/TasksDayNav";
import { TasksListContent } from "@/components/tasks/TasksListContent";
import { TasksSegmentControl } from "@/components/tasks/TasksSegmentControl";
import { sortByStartTime, type TaskSegment } from "@/components/tasks/tasks-derive";
import { useTaskDay } from "@/components/tasks/useTaskDay";
import { useTaskLifecycle } from "@/components/tasks/useTaskLifecycle";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  TASK_AUDIT_ACTION_TYPES,
  TASK_EVENT_TYPE_PREFIXES,
  isOffShiftError,
  retryUnlessClientError,
  taskKeys,
  tasksApi,
} from "@/lib/api/tasks";
import { addIsoDays } from "@/lib/datetime";
import { resolveTaskGateRole } from "@/lib/task-permissions";
import type { Task } from "@/types/tasks";

export function TasksScreen() {
  const { t } = useTranslation();

  // BootstrapGate (the route wrapper) resolved identity before mounting us.
  const identity = useIdentity();
  const meUserId = identity.data?.id ?? null;
  const gateRole = identity.data
    ? resolveTaskGateRole({ role: identity.data.role, effectiveRole: identity.data.effectiveRole })
    : "";

  const [segment, setSegment] = useState<TaskSegment>("all");
  const { today, day, setDay, isToday } = useTaskDay();
  const { actionErrorKey, pendingTaskId, onAction } = useTaskLifecycle();

  useRealtimeInvalidation({
    typePrefixes: TASK_EVENT_TYPE_PREFIXES,
    auditActionTypes: TASK_AUDIT_ACTION_TYPES,
    queryKeys: [taskKeys.all],
  });

  const dayQuery = useQuery<Task[], Error>({
    queryKey: taskKeys.day(day),
    queryFn: () => tasksApi.listByDay(day),
    enabled: segment === "all" && day.length > 0,
    retry: retryUnlessClientError,
  });

  const mineQuery = useQuery<Task[], Error>({
    queryKey: taskKeys.mine(),
    queryFn: () => tasksApi.listMine(),
    enabled: segment === "mine",
    retry: retryUnlessClientError,
  });

  const activeQuery = segment === "all" ? dayQuery : mineQuery;
  const tasks = useMemo(() => sortByStartTime(activeQuery.data ?? []), [activeQuery.data]);

  const renderItem = useCallback<ListRenderItem<Task>>(
    ({ item }) => (
      <TaskRow
        task={item}
        meUserId={meUserId}
        gateRole={gateRole}
        isPending={item.id === pendingTaskId}
        onAction={onAction}
      />
    ),
    [meUserId, gateRole, pendingTaskId, onAction],
  );

  const { refetch } = activeQuery;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onShiftDay = useCallback(
    (delta: 1 | -1) => {
      // Keep the current day when arithmetic rejects the input.
      setDay((current) => addIsoDays(current, delta) ?? current);
    },
    [setDay],
  );

  const onBackToToday = useCallback(() => {
    setDay(today);
  }, [setDay, today]);

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        <TasksSegmentControl segment={segment} onChange={setSegment} />

        {segment === "all" ? (
          <TasksDayNav
            day={day}
            isToday={isToday}
            onShiftDay={onShiftDay}
            onBackToToday={onBackToToday}
          />
        ) : (
          // /api/tasks/me is inherently the clinic's today — no day nav here.
          <View className="mb-3 items-center">
            <Text className="font-rubik text-[13px] text-muted">{t("tasks.today")}</Text>
          </View>
        )}

        {/* Lifecycle action error — coded server denial, translated, no toast. */}
        {actionErrorKey ? (
          <Text className="mb-2.5 text-center font-rubik text-[13px] text-danger">
            {t(actionErrorKey)}
          </Text>
        ) : null}

        <TasksListContent
          offShift={activeQuery.isError && isOffShiftError(activeQuery.error)}
          isPending={activeQuery.isPending}
          isError={activeQuery.isError}
          tasks={tasks}
          segment={segment}
          onRetry={onRetry}
          renderItem={renderItem}
        />
      </View>
    </View>
  );
}
