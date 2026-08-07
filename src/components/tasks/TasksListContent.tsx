/**
 * The task list's state ladder — off-shift / loading / error / empty / list —
 * extracted from the screen so each function stays under the complexity limit.
 *
 * Off-shift (roster-derived 403 INSUFFICIENT_ROLE) is a DEDICATED empty state
 * with a quiet retry, never an error surface (G3-PLAN §1.6). Loading is honest
 * static skeletons (no shimmer). Errors reuse the Slice-1 ErrorNote.
 */
import { ActivityIndicator, Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import type { Task } from "@/types/tasks";

import type { TaskSegment } from "./tasks-derive";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

export function TasksListContent({
  offShift,
  isPending,
  isError,
  tasks,
  segment,
  onRetry,
  renderItem,
}: Readonly<{
  offShift: boolean;
  isPending: boolean;
  isError: boolean;
  tasks: Task[];
  segment: TaskSegment;
  onRetry: () => void;
  renderItem: ListRenderItem<Task>;
}>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  if (offShift) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("tasks.offShiftTitle")} body={t("tasks.offShiftBody")} />
        <PressableScale
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5"
          onPress={onRetry}
        >
          <Text className="font-rubik-semibold text-[14px] text-muted">{t("common.retry")}</Text>
        </PressableScale>
      </View>
    );
  }

  if (isPending) {
    return (
      <View className="flex-1 pt-1">
        {SKELETON_ROWS.map((i) => (
          <RowSkeleton key={i} />
        ))}
        <View className="items-center pt-2">
          <ActivityIndicator color={light ? "#6D28D9" : "#A78BFA"} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center">
        <ErrorNote message={t("tasks.loadError")} onRetry={onRetry} />
      </View>
    );
  }

  if (tasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={segment === "mine" ? t("tasks.emptyMine") : t("tasks.empty")} />
      </View>
    );
  }

  return (
    <FlashList
      data={tasks}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    />
  );
}
