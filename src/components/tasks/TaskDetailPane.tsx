/**
 * Task detail pane — the tablet-only (Slice 13) detail surface for the Tasks
 * screen.
 *
 * Tasks deliberately have NO detail route (the Slice-1 route contract is
 * frozen), so on a phone every field a task carries is compressed into
 * `TaskRow`: the description is clamped to two lines and the free-text device
 * and location share one truncated line. The iPad's detail pane is the first
 * place with room to show them in full, so this component exists only to spend
 * that room — it adds no data fetching and no new lifecycle path.
 *
 * Doctrine: opaque `--color-surface` card, zero blur, zero layout animation.
 * The lifecycle button and edit affordance are the SAME components and the same
 * handlers the row uses, so a tablet action goes down the identical mutation
 * path as a phone action.
 */
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { formatTime } from "@/lib/datetime";
import type { Task } from "@/types/tasks";

import { TaskChips } from "./TaskChips";
import { TaskLifecycleButton } from "./TaskLifecycleButton";
import type { TaskActionHandler, TaskEditHandler } from "./TaskRow";
import { taskLifecycleAction } from "./tasks-derive";

/** One labelled free-text field; renders nothing when the value is blank. */
function DetailField({ label, value }: Readonly<{ label: string; value: string | null }>) {
  if (!value) return null;
  return (
    <View className="mt-3">
      <Text className="font-rubik text-[12px] text-text-tertiary">{label}</Text>
      {/* Free text the clinic typed — LTR-forced like the row, since device ids
          and room codes are latin/numeric even in a Hebrew UI. */}
      <Text className="mt-0.5 font-rubik text-[15px] text-foreground" style={{ writingDirection: "ltr" }}>
        {value}
      </Text>
    </View>
  );
}

export function TaskDetailPane({
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
  /** Provided only to editors (task.create) — surfaces the edit button. */
  onEdit?: TaskEditHandler;
}>) {
  const { t } = useTranslation();

  const action = taskLifecycleAction(task, meUserId, gateRole);
  const startLabel = formatTime(task.startTime);
  const endLabel = formatTime(task.endTime);
  const timeLabel = startLabel && endLabel ? `${startLabel}–${endLabel}` : (startLabel ?? "");
  const isMine = meUserId != null && task.vetId === meUserId;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 22 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="rounded-[20px] border border-border bg-surface px-4 py-4">
        {/* Unclamped: the pane exists to show the description the row truncates. */}
        <Text className="font-rubik-semibold text-[18px] text-foreground">
          {task.notes?.trim() || t("tasks.noNotes")}
        </Text>

        {timeLabel ? (
          <Text className="mt-1 font-rubik text-[14px] text-muted" style={{ writingDirection: "ltr" }}>
            {timeLabel}
          </Text>
        ) : null}

        <TaskChips task={task} isMine={isMine} />

        <DetailField label={t("tasks.detail.device")} value={task.animalId?.trim() || null} />
        <DetailField label={t("tasks.detail.location")} value={task.ownerId?.trim() || null} />

        {action ? (
          <TaskLifecycleButton
            action={action}
            isPending={isPending}
            onPress={(a) => onAction(task, a)}
          />
        ) : null}

        {onEdit ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("tasks.form.editTitle")}
            accessibilityHint={t("tasks.form.editHint")}
            className="mt-3 min-h-[44px] items-center justify-center rounded-[16px] border border-border bg-background"
            onPress={() => onEdit(task)}
          >
            <Text className="font-rubik-semibold text-[15px] text-foreground">
              {t("tasks.form.editTitle")}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </ScrollView>
  );
}
