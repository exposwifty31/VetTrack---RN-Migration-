/** Status / priority / type / mine chips — extracted so TaskRow stays layout-only. */
import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import type { Task } from "@/types/tasks";

import {
  priorityLabelKey,
  priorityTone,
  statusLabelKey,
  statusTone,
  taskTypeLabelKey,
} from "./tasks-derive";

export const TaskChips = memo(function TaskChips({
  task,
  isMine,
}: Readonly<{ task: Task; isMine: boolean }>) {
  const { t } = useTranslation();
  const statusKey = statusLabelKey(task.status);
  const priorityKey = priorityLabelKey(task.priority);
  const typeKey = taskTypeLabelKey(task.taskType);

  return (
    <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
      <Chip label={statusKey ? t(statusKey) : task.status} tone={statusTone(task.status)} />
      {priorityKey ? <Chip label={t(priorityKey)} tone={priorityTone(task.priority)} /> : null}
      {typeKey ? <Chip label={t(typeKey)} /> : null}
      {isMine ? <Chip label={t("tasks.mine")} tone="info" /> : null}
    </View>
  );
});
