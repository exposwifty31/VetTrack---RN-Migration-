/**
 * Tasks — G3 Slice 3 (3a read/day-nav/lifecycle + 3b create/edit/cancel):
 * clinic day view + "mine" segment + day navigation + start/complete lifecycle
 * + the create/edit/cancel form in the Slice-1 `BottomSheet` (the screen's ONE
 * blur layer — mounted only while the form modal is open).
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the five verified
 *     task audit actionTypes (+ the best-effort TASK_ broadcast prefix) already
 *     covers task_created/updated/cancelled, so the 3b mutations plain-invalidate
 *     and let the same channel reconcile. No polling, no refetchInterval. The
 *     `useTaskDay` AppState listener is clock state only, never a data trigger.
 *   - Off-shift 403 INSUFFICIENT_ROLE renders the dedicated empty state —
 *     never an error surface (G3-PLAN §1.6); the create FAB + row-edit are
 *     role-gated so an off-shift user (gate-role below the floor) sees neither.
 *   - List rows are opaque; the only motion is PressableScale press feedback.
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
import { PressableScale } from "@/components/PressableScale";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { SelectPlaceholder, TwoPane } from "@/components/tablet/TwoPane";
import { resolveSelectedItem } from "@/components/tablet/two-pane-layout";
import { TaskDetailPane } from "@/components/tasks/TaskDetailPane";
import { TaskFormSheet, type TaskFormRequest } from "@/components/tasks/TaskFormSheet";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TasksDayNav } from "@/components/tasks/TasksDayNav";
import { TasksListContent } from "@/components/tasks/TasksListContent";
import { TasksSegmentControl } from "@/components/tasks/TasksSegmentControl";
import { canEditTasks } from "@/components/tasks/task-form-derive";
import { resolveFormDay, sortByStartTime, type TaskSegment } from "@/components/tasks/tasks-derive";
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
import { useIsTablet } from "@/lib/use-is-tablet";
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

  // 3b: create/edit sheet. Gated on the task-RBAC create decision (senior+),
  // so an off-shift or read-only user sees neither the FAB nor a row-edit.
  const canEdit = canEditTasks(gateRole);
  const [formRequest, setFormRequest] = useState<TaskFormRequest | null>(null);
  const onEdit = useCallback((task: Task) => setFormRequest({ mode: "edit", task }), []);
  const closeForm = useCallback(() => setFormRequest(null), []);

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

  // Slice 13: on a tablet the list stays mounted in the master pane and a row
  // press SELECTS (the detail pane shows the full task + the same lifecycle and
  // edit affordances). On a phone the Slice-3 behaviour is untouched — an
  // editor's row press still opens the edit sheet directly.
  const isTablet = useIsTablet();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onSelect = useCallback((task: Task) => setSelectedId(task.id), []);

  const renderItem = useCallback<ListRenderItem<Task>>(
    ({ item }) => (
      <TaskRow
        task={item}
        meUserId={meUserId}
        gateRole={gateRole}
        isPending={item.id === pendingTaskId}
        onAction={onAction}
        onEdit={canEdit ? onEdit : undefined}
        onSelect={isTablet ? onSelect : undefined}
      />
    ),
    [meUserId, gateRole, pendingTaskId, onAction, canEdit, onEdit, isTablet, onSelect],
  );

  // Selection is DERIVED from the live list: changing day or segment, or a
  // realtime invalidation that drops the task, collapses the detail pane back
  // to its placeholder instead of stranding a task the user can no longer see.
  const selected = resolveSelectedItem(tasks, selectedId);

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

  const masterPane = (
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
  );

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      {isTablet ? (
        <TwoPane
          master={masterPane}
          detail={
            selected ? (
              <TaskDetailPane
                task={selected}
                meUserId={meUserId}
                gateRole={gateRole}
                isPending={selected.id === pendingTaskId}
                onAction={onAction}
                onEdit={canEdit ? onEdit : undefined}
              />
            ) : null
          }
          placeholder={
            <SelectPlaceholder title={t("tablet.selectTask")} body={t("tablet.selectTaskBody")} />
          }
          masterLabel={t("nav.tasks")}
          detailLabel={t("tablet.selectTask")}
        />
      ) : (
        masterPane
      )}

      {/* Create entry — a primary FAB, editors only. Logical `end` inset flips */}
      {/* under RTL. Hidden while the off-shift empty state owns the screen. */}
      {canEdit && !(activeQuery.isError && isOffShiftError(activeQuery.error)) ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("tasks.form.newTitle")}
          className="absolute bottom-8 end-6 overflow-hidden rounded-full"
          style={{ boxShadow: "0 6px 18px rgba(76,29,149,0.45)" }}
          onPress={() => setFormRequest({ mode: "create" })}
        >
          <View
            className="h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#7C3AED] to-[#6D28D9]"
            style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
          >
            {/* AA: white on #6D28D9 = 7.10. */}
            <Text className="font-rubik-bold text-[28px] leading-[30px] text-white">+</Text>
          </View>
        </PressableScale>
      ) : null}

      {/* Create anchors on TODAY in the `mine` view (its list is clinic-today), */}
      {/* never the stale `all`-segment day that persists in state. Edit overrides. */}
      <TaskFormSheet
        request={formRequest}
        day={resolveFormDay(segment, today, day)}
        gateRole={gateRole}
        onClose={closeForm}
      />
    </View>
  );
}
