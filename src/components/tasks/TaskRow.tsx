/**
 * Aurora task row — OPAQUE `--color-surface` card (rows never sit on glass),
 * zero content/layout animation. Responsible ONLY for row layout + the derived
 * view model; chips and the lifecycle affordance are child components.
 * Module-scope + memo keeps FlashList recycling cheap.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatTime } from "@/lib/datetime";
import type { Task } from "@/types/tasks";

import { TaskChips } from "./TaskChips";
import { TaskLifecycleButton } from "./TaskLifecycleButton";
import { taskLifecycleAction, type TaskLifecycleAction } from "./tasks-derive";

export type TaskActionHandler = (task: Task, action: TaskLifecycleAction) => void;
export type TaskEditHandler = (task: Task) => void;

export const TaskRow = memo(function TaskRow({
  task,
  meUserId,
  gateRole,
  isPending,
  onAction,
  onEdit,
}: Readonly<{
  task: Task;
  meUserId: string | null;
  gateRole: string;
  /** True while THIS task's lifecycle mutation is in flight. */
  isPending: boolean;
  onAction: TaskActionHandler;
  /** Provided only to editors (task.create) — makes the row open the edit sheet. */
  onEdit?: TaskEditHandler;
}>) {
  const { t } = useTranslation();

  const action = taskLifecycleAction(task, meUserId, gateRole);
  const startLabel = formatTime(task.startTime);
  const endLabel = formatTime(task.endTime);
  const timeLabel = startLabel && endLabel ? `${startLabel}–${endLabel}` : (startLabel ?? "");
  const detailParts = [task.animalId?.trim(), task.ownerId?.trim()].filter(Boolean) as string[];
  const isMine = meUserId != null && task.vetId === meUserId;

  // Editors get a pressable card (opens edit); everyone else a static card. The
  // nested lifecycle button captures its own press, so Start/Complete still wins.
  const Card = onEdit ? Pressable : View;
  const cardProps = onEdit
    ? {
        accessibilityRole: "button" as const,
        accessibilityLabel: task.notes?.trim() || t("tasks.noNotes"),
        accessibilityHint: t("tasks.form.editHint"),
        onPress: () => onEdit(task),
      }
    : {};

  return (
    <Card className="mb-2.5 rounded-[20px] border border-border bg-surface px-4 py-3" {...cardProps}>
      <View className="flex-row items-start gap-3">
        <Text className="flex-1 font-rubik-semibold text-[15px] text-foreground" numberOfLines={2}>
          {task.notes?.trim() || t("tasks.noNotes")}
        </Text>
        {timeLabel ? (
          <Text className="font-rubik text-[13px] text-muted" style={{ writingDirection: "ltr" }}>
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

      <TaskChips task={task} isMine={isMine} />

      {action ? (
        <TaskLifecycleButton
          action={action}
          isPending={isPending}
          onPress={(a) => onAction(task, a)}
        />
      ) : null}
    </Card>
  );
});
