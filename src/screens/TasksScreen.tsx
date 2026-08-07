/**
 * Tasks — G3 Slice 3a: clinic day view + "mine" segment + day navigation +
 * start/complete lifecycle. (3b — create/edit via BottomSheet + /meta assignee
 * picker — is the declared remainder; this screen keeps ZERO blur layers until
 * that sheet lands.)
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the five verified
 *     task audit actionTypes (+ the best-effort TASK_ broadcast prefix). No
 *     polling, no refetchInterval.
 *   - Off-shift 403 INSUFFICIENT_ROLE renders the dedicated empty state —
 *     never an error surface (G3-PLAN §1.6).
 *   - Rows are opaque; the only motion is PressableScale press feedback.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, I18nManager, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { useIdentity } from "@/app/useIdentity";
import { PressableScale } from "@/components/PressableScale";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { TaskRow, type TaskActionHandler } from "@/components/tasks/TaskRow";
import {
  lifecycleErrorKey,
  sortByStartTime,
  type LifecycleErrorKey,
  type TaskLifecycleAction,
} from "@/components/tasks/tasks-derive";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  TASK_AUDIT_ACTION_TYPES,
  TASK_EVENT_TYPE_PREFIXES,
  TasksApiError,
  isOffShiftError,
  taskKeys,
  tasksApi,
} from "@/lib/api/tasks";
import { addIsoDays, formatDayLabel, isoDayDate, isoDayString } from "@/lib/datetime";
import { resolveTaskGateRole } from "@/lib/task-permissions";
import type { Task } from "@/types/tasks";

type Segment = "all" | "mine";

// Layout direction is fixed at boot (rtl-bootstrap) — module constants are safe.
// "Next day" points forward in reading direction; "previous" mirrors it.
const NEXT_CHEVRON = I18nManager.isRTL ? "‹" : "›";
const PREV_CHEVRON = I18nManager.isRTL ? "›" : "‹";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

/** Default-retry parity (retry: 1) minus pointless 4xx retries. */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof TasksApiError && error.status < 500) return false;
  return failureCount < 1;
}

function SegmentChip({
  label,
  selected,
  onPress,
}: Readonly<{ label: string; selected: boolean; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`min-h-[44px] flex-1 items-center justify-center rounded-[20px] border px-4 py-2.5 ${
        selected ? "border-primary bg-primary" : "border-border bg-surface"
      }`}
      onPress={onPress}
    >
      <Text
        className={`font-rubik-semibold text-[14px] ${
          selected ? "text-primary-foreground" : "text-muted"
        }`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function TasksScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const queryClient = useQueryClient();

  // BootstrapGate (the route wrapper) resolved identity before mounting us.
  const identity = useIdentity();
  const meUserId = identity.data?.id ?? null;
  const gateRole = identity.data
    ? resolveTaskGateRole({ role: identity.data.role, effectiveRole: identity.data.effectiveRole })
    : "";

  const [segment, setSegment] = useState<Segment>("all");
  // Mount-captured local day (lazy init keeps render pure). A shift spanning
  // midnight keeps the mount-time "today" until the screen remounts — the same
  // trade the web day view makes.
  const [today] = useState<string>(() => isoDayString(Date.now()) ?? "");
  const [day, setDay] = useState<string>(today);
  const [actionErrorKey, setActionErrorKey] = useState<LifecycleErrorKey | null>(null);

  const isToday = day === today;

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

  const lifecycle = useMutation({
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

  const pendingTaskId = lifecycle.isPending ? (lifecycle.variables?.task.id ?? null) : null;

  const onAction = useCallback<TaskActionHandler>(
    (task, action) => {
      lifecycle.mutate({ task, action });
    },
    [lifecycle],
  );

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
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

  const dayLabel = formatDayLabel(isoDayDate(day), i18n.language);
  const offShift = activeQuery.isError && isOffShiftError(activeQuery.error);

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        {/* Segment control — All / Mine (mine = the server's clinic-today scope). */}
        <View className="mb-2.5 flex-row gap-2.5">
          <SegmentChip
            label={t("tasks.segmentAll")}
            selected={segment === "all"}
            onPress={() => setSegment("all")}
          />
          <SegmentChip
            label={t("tasks.segmentMine")}
            selected={segment === "mine"}
            onPress={() => setSegment("mine")}
          />
        </View>

        {/* Day navigation (All only — /api/tasks/me is inherently today). */}
        {segment === "all" ? (
          <View className="mb-3 flex-row items-center gap-2.5">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t("tasks.prevDay")}
              className="h-[44px] w-[44px] items-center justify-center rounded-[20px] border border-border bg-surface"
              onPress={() => setDay((d) => addIsoDays(d, -1) ?? d)}
            >
              <Text className="font-rubik-bold text-[20px] text-foreground">{PREV_CHEVRON}</Text>
            </PressableScale>
            <View className="flex-1 items-center">
              <Text className="font-rubik-semibold text-[15px] text-foreground" numberOfLines={1}>
                {isToday ? t("tasks.today") : (dayLabel ?? day)}
              </Text>
              {isToday ? (
                dayLabel ? (
                  <Text className="font-rubik text-[12px] text-muted">{dayLabel}</Text>
                ) : null
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => setDay(today)}
                >
                  <Text className="font-rubik-semibold text-[12px] text-primary">
                    {t("tasks.backToToday")}
                  </Text>
                </PressableScale>
              )}
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t("tasks.nextDay")}
              className="h-[44px] w-[44px] items-center justify-center rounded-[20px] border border-border bg-surface"
              onPress={() => setDay((d) => addIsoDays(d, 1) ?? d)}
            >
              <Text className="font-rubik-bold text-[20px] text-foreground">{NEXT_CHEVRON}</Text>
            </PressableScale>
          </View>
        ) : (
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

        {offShift ? (
          // Roster-derived 403 → dedicated empty state, NOT an error surface.
          <View className="flex-1 items-center justify-center">
            <ListEmptyState title={t("tasks.offShiftTitle")} body={t("tasks.offShiftBody")} />
            <PressableScale
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5"
              onPress={() => {
                void activeQuery.refetch();
              }}
            >
              <Text className="font-rubik-semibold text-[14px] text-muted">
                {t("common.retry")}
              </Text>
            </PressableScale>
          </View>
        ) : activeQuery.isPending ? (
          <View className="flex-1 pt-1">
            {SKELETON_ROWS.map((i) => (
              <RowSkeleton key={i} />
            ))}
            <View className="items-center pt-2">
              <ActivityIndicator color={light ? "#6D28D9" : "#A78BFA"} />
            </View>
          </View>
        ) : activeQuery.isError ? (
          <View className="flex-1 items-center justify-center gap-3">
            <Text className="text-center font-rubik text-[15px] text-danger">
              {t("tasks.loadError")}
            </Text>
            <PressableScale
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5"
              onPress={() => {
                void activeQuery.refetch();
              }}
            >
              <Text className="font-rubik-semibold text-[15px] text-foreground">
                {t("common.retry")}
              </Text>
            </PressableScale>
          </View>
        ) : tasks.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ListEmptyState
              title={segment === "mine" ? t("tasks.emptyMine") : t("tasks.empty")}
            />
          </View>
        ) : (
          <FlashList
            data={tasks}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </View>
  );
}
