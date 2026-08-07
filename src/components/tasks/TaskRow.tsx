/**
 * Aurora task row — OPAQUE `--color-surface` card (rows never sit on glass),
 * zero content/layout animation; the only motion is PressableScale feedback on
 * the lifecycle button. Module-scope + memo keeps FlashList recycling cheap.
 */
import { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { Chip } from "@/components/ui/Chip";
import { formatTime } from "@/lib/datetime";
import { haptics } from "@/lib/haptics";
import type { Task } from "@/types/tasks";

import {
  priorityLabelKey,
  priorityTone,
  statusLabelKey,
  statusTone,
  taskLifecycleAction,
  taskTypeLabelKey,
  type TaskLifecycleAction,
} from "./tasks-derive";

export type TaskActionHandler = (task: Task, action: TaskLifecycleAction) => void;

export const TaskRow = memo(function TaskRow({
  task,
  meUserId,
  gateRole,
  isPending,
  onAction,
}: Readonly<{
  task: Task;
  meUserId: string | null;
  gateRole: string;
  /** True while THIS task's lifecycle mutation is in flight. */
  isPending: boolean;
  onAction: TaskActionHandler;
}>) {
  const { t } = useTranslation();

  const action = taskLifecycleAction(task, meUserId, gateRole);
  const statusKey = statusLabelKey(task.status);
  const priorityKey = priorityLabelKey(task.priority);
  const typeKey = taskTypeLabelKey(task.taskType);
  const startLabel = formatTime(task.startTime);
  const endLabel = formatTime(task.endTime);
  const timeLabel = startLabel && endLabel ? `${startLabel}–${endLabel}` : (startLabel ?? "");
  const detailParts = [task.animalId?.trim(), task.ownerId?.trim()].filter(Boolean) as string[];

  return (
    <View className="mb-2.5 rounded-[20px] border border-border bg-surface px-4 py-3">
      <View className="flex-row items-start gap-3">
        <Text
          className="flex-1 font-rubik-semibold text-[15px] text-foreground"
          numberOfLines={2}
        >
          {task.notes?.trim() || t("tasks.noNotes")}
        </Text>
        {timeLabel ? (
          <Text
            className="font-rubik text-[13px] text-muted"
            style={{ writingDirection: "ltr" }}
          >
            {timeLabel}
          </Text>
        ) : null}
      </View>

      {detailParts.length > 0 ? (
        <Text
          className="mt-1 font-rubik text-[12px] text-text-tertiary"
          numberOfLines={1}
          style={{ writingDirection: "ltr" }}
        >
          {detailParts.join(" · ")}
        </Text>
      ) : null}

      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        <Chip
          label={statusKey ? t(statusKey) : task.status}
          tone={statusTone(task.status)}
        />
        {priorityKey ? <Chip label={t(priorityKey)} tone={priorityTone(task.priority)} /> : null}
        {typeKey ? <Chip label={t(typeKey)} /> : null}
        {meUserId != null && task.vetId === meUserId ? (
          <Chip label={t("tasks.mine")} tone="info" />
        ) : null}
      </View>

      {action ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={action === "start" ? t("tasks.start") : t("tasks.complete")}
          accessibilityState={{ disabled: isPending }}
          disabled={isPending}
          className={`mt-3 min-h-[44px] items-center justify-center self-start rounded-xl bg-primary px-6 py-2.5 ${
            isPending ? "opacity-60" : ""
          }`}
          onPress={() => {
            haptics.tap();
            onAction(task, action);
          }}
        >
          <Text className="font-rubik-semibold text-[15px] text-primary-foreground">
            {action === "start" ? t("tasks.start") : t("tasks.complete")}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
});
