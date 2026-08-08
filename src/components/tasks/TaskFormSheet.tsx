/**
 * Create / edit task sheet (G3 Slice 3b) — the screen's single blur layer.
 *
 * Presentation mirrors `ShiftAdjustmentSheet` exactly: an RN transparent `Modal`
 * hosting the Slice-1 `BottomSheet` (navigation files are frozen post-Slice-1,
 * so no new transparentModal route). The T2 glass exists only while the modal is
 * open; the Tasks screen otherwise carries ZERO blur — within the ≤2 budget.
 *
 * Fields are trimmed to the keyboard-friendly core (notes + start stepper +
 * duration stepper + priority + assignee) so the content fits the frozen
 * no-internal-scroll sheet with Save reachable above the keyboard. Times are
 * stepper-based (no datetimepicker dependency — the native set is frozen for
 * CNG prebuild) and pinned LTR. The server stays the authority: its coded
 * rejections (conflict / outside-shift / transition / …) render translated via
 * `taskErrorKey`; the client only pre-empts the empty/no-op cases by disabling
 * Save. Edit sends ONLY the changed fields (PATCH requires ≥1). Cancel is a
 * static danger action — never glassed, never animated.
 */
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { retryUnlessClientError, taskKeys, tasksApi } from "@/lib/api/tasks";
import { isoDayString } from "@/lib/datetime";
import type { Task, TaskCreateInput, TaskPriority, TaskUpdateInput } from "@/types/tasks";

import {
  AssigneePicker,
  DurationStepperRow,
  PrioritySegment,
  TimeStepperRow,
} from "./TaskFormControls";
import {
  DEFAULT_DURATION_MINUTES,
  addClockMinutes,
  assigneeOptions,
  buildTaskWindow,
  canAssignTasks,
  canCancelTasks,
  clampDuration,
  clockFromIso,
  durationMinutesBetween,
  splitDuration,
} from "./task-form-derive";
import { taskErrorKey, useTaskMutations } from "./useTaskMutations";

const DEFAULT_START_CLOCK = "09:00";
const NOTES_MAX_LENGTH = 4000;
const CANCEL_REASON_MAX_LENGTH = 4000;

/** null = closed. Create carries no task; edit prefills from the tapped task. */
export type TaskFormRequest = { mode: "create" } | { mode: "edit"; task: Task };

type SheetContentProps = Readonly<{
  request: TaskFormRequest;
  /** Selected day (YYYY-MM-DD) — the create anchor + the meta window. */
  day: string;
  gateRole: string;
  onClose: () => void;
}>;

function useDurationLabel() {
  const { t } = useTranslation();
  return (minutes: number): string => {
    const { hours, minutes: mins } = splitDuration(minutes);
    if (hours > 0 && mins > 0) return t("tasks.form.durationHm", { h: hours, m: mins });
    if (hours > 0) return t("tasks.form.durationH", { h: hours });
    return t("tasks.form.durationM", { m: mins });
  };
}

/** The changed-fields diff for an edit (PATCH needs ≥1). Instant-compares the */
/** rebuilt window so an untouched time is never re-sent. */
function buildTaskDiff(
  task: Task,
  values: {
    notes: string;
    priority: TaskPriority;
    vetId: string | null;
    window: { startTime: string; endTime: string } | null;
  },
): TaskUpdateInput {
  const diff: TaskUpdateInput = {};
  const trimmed = values.notes.trim();
  if (trimmed !== (task.notes ?? "").trim()) diff.notes = trimmed || null;
  if (values.priority !== ((task.priority ?? "normal") as TaskPriority)) {
    diff.priority = values.priority;
  }
  if ((values.vetId ?? null) !== (task.vetId ?? null)) diff.vetId = values.vetId;
  if (values.window) {
    const startChanged = Date.parse(values.window.startTime) !== Date.parse(task.startTime);
    const endChanged = Date.parse(values.window.endTime) !== Date.parse(task.endTime);
    if (startChanged || endChanged) {
      diff.startTime = values.window.startTime;
      diff.endTime = values.window.endTime;
    }
  }
  return diff;
}

function SheetContent({ request, day, gateRole, onClose }: SheetContentProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const durationLabel = useDurationLabel();

  const editing = request.mode === "edit" ? request.task : null;
  const canAssign = canAssignTasks(gateRole);
  const canCancel = canCancelTasks(gateRole);

  // Edit anchors the window on the task's OWN local day (it may differ from the
  // screen's selected day when opened from the "mine" segment); create uses the
  // selected day. Falls back to the selected day if the task time is unparseable.
  const anchorDay = editing ? (isoDayString(editing.startTime) ?? day) : day;

  const [notes, setNotes] = useState(() => editing?.notes?.trim() ?? "");
  const [startClock, setStartClock] = useState(
    () => (editing ? clockFromIso(editing.startTime) : null) ?? DEFAULT_START_CLOCK,
  );
  const [durationMinutes, setDurationMinutes] = useState(() =>
    clampDuration(
      (editing ? durationMinutesBetween(editing.startTime, editing.endTime) : null) ??
        DEFAULT_DURATION_MINUTES,
    ),
  );
  const [priority, setPriority] = useState<TaskPriority>(
    () => (editing?.priority ?? "normal") as TaskPriority,
  );
  const [vetId, setVetId] = useState<string | null>(() => editing?.vetId ?? null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { create, update, cancel } = useTaskMutations();

  const metaQuery = useQuery({
    queryKey: taskKeys.meta(anchorDay),
    queryFn: () => tasksApi.getMeta(anchorDay),
    enabled: canAssign && anchorDay.length > 0,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
  const options = useMemo(() => assigneeOptions(metaQuery.data), [metaQuery.data]);

  const window = buildTaskWindow(anchorDay, startClock, durationMinutes);

  // Edit → the changed-fields diff (PATCH needs ≥1). Create → the full body.
  // Not memoized: `window` is a fresh object each render, so a memo never hits;
  // the diff is a cheap field comparison.
  const changed = editing ? buildTaskDiff(editing, { notes, priority, vetId, window }) : {};

  const isDirty = !editing || Object.keys(changed).length > 0;
  const busy = create.isPending || update.isPending || cancel.isPending;
  const saveDisabled = busy || !window || !isDirty;

  const activeError = create.error ?? update.error ?? cancel.error;
  const serverErrorKey = activeError ? taskErrorKey(activeError) : null;

  const onSave = () => {
    if (!window || saveDisabled) return;
    if (editing) {
      update.mutate({ id: editing.id, input: changed }, { onSuccess: onClose });
      return;
    }
    const input: TaskCreateInput = {
      startTime: window.startTime,
      endTime: window.endTime,
      priority,
    };
    const trimmed = notes.trim();
    if (trimmed) input.notes = trimmed;
    if (vetId) input.vetId = vetId;
    create.mutate(input, { onSuccess: onClose });
  };

  const onConfirmCancel = () => {
    if (!editing || busy) return;
    cancel.mutate(
      { id: editing.id, reason: cancelReason.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <View className="gap-3.5">
      <Text className="font-rubik-bold text-[17px] text-foreground">
        {editing ? t("tasks.form.editTitle") : t("tasks.form.newTitle")}
      </Text>

      <View>
        <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">{t("tasks.form.notes")}</Text>
        <TextInput
          className="min-h-[64px] rounded-[16px] border border-border bg-surface-raised px-4 py-3 font-rubik text-[14px] text-foreground"
          placeholder={t("tasks.form.notesPlaceholder")}
          placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={NOTES_MAX_LENGTH}
          accessibilityLabel={t("tasks.form.notes")}
        />
      </View>

      <TimeStepperRow
        label={t("tasks.form.startTime")}
        value={startClock}
        onStep={(delta) => setStartClock((current) => addClockMinutes(current, delta))}
      />

      <DurationStepperRow
        label={t("tasks.form.duration")}
        valueLabel={durationLabel(durationMinutes)}
        onStep={(delta) => setDurationMinutes((current) => clampDuration(current + delta))}
      />

      <PrioritySegment value={priority} onChange={setPriority} />

      {canAssign ? (
        <AssigneePicker
          options={options}
          selectedId={vetId}
          onSelect={setVetId}
          loading={metaQuery.isPending}
        />
      ) : null}

      {serverErrorKey ? (
        <Text className="text-center font-rubik-semibold text-[13px] text-danger">
          {t(serverErrorKey)}
        </Text>
      ) : null}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("common.save")}
        accessibilityState={{ disabled: saveDisabled }}
        disabled={saveDisabled}
        className="overflow-hidden rounded-[20px]"
        onPress={onSave}
      >
        <View
          className={`min-h-[48px] items-center justify-center rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-3 ${
            saveDisabled ? "opacity-60" : ""
          }`}
          style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
        >
          {/* AA: solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
          <Text className="font-rubik-semibold text-[16px] text-white">{t("common.save")}</Text>
        </View>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        className="min-h-[44px] items-center justify-center"
        onPress={onClose}
      >
        <Text className="font-rubik-semibold text-[14px] text-muted">{t("common.cancel")}</Text>
      </PressableScale>

      {/* Danger cancel-task action — static (no scale, no glass) per the danger rule. */}
      {editing && canCancel ? (
        confirmingCancel ? (
          <View className="mt-1 gap-2.5 rounded-[16px] border border-danger-solid p-3">
            <Text className="font-rubik-semibold text-[13px] text-foreground">
              {t("tasks.form.cancelConfirm")}
            </Text>
            <TextInput
              className="min-h-[44px] rounded-[12px] border border-border bg-surface px-3.5 py-2.5 font-rubik text-[13px] text-foreground"
              placeholder={t("tasks.form.cancelReasonPlaceholder")}
              placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
              value={cancelReason}
              onChangeText={setCancelReason}
              maxLength={CANCEL_REASON_MAX_LENGTH}
              accessibilityLabel={t("tasks.form.cancelReason")}
            />
            <View className="flex-row gap-2.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tasks.form.keepTask")}
                disabled={busy}
                className="min-h-[44px] flex-1 items-center justify-center rounded-[14px] border border-border bg-surface px-4 py-2.5"
                onPress={() => setConfirmingCancel(false)}
              >
                <Text className="font-rubik-semibold text-[14px] text-muted">
                  {t("tasks.form.keepTask")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tasks.form.confirmCancelTask")}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-[14px] bg-danger-solid px-4 py-2.5 ${
                  busy ? "opacity-60" : ""
                }`}
                onPress={onConfirmCancel}
              >
                {/* AA: white on --color-danger-solid = 4.83 dark / 6.47 light. */}
                <Text className="font-rubik-semibold text-[14px] text-white">
                  {t("tasks.form.confirmCancelTask")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tasks.form.cancelTask")}
            className="min-h-[44px] items-center justify-center rounded-[14px] border border-danger-solid px-4 py-2.5"
            onPress={() => {
              cancel.reset();
              setConfirmingCancel(true);
            }}
          >
            <Text className="font-rubik-semibold text-[14px] text-danger">
              {t("tasks.form.cancelTask")}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

type TaskFormSheetProps = Readonly<{
  request: TaskFormRequest | null;
  day: string;
  gateRole: string;
  onClose: () => void;
}>;

export function TaskFormSheet({ request, day, gateRole, onClose }: TaskFormSheetProps) {
  const contentKey = request == null ? "" : request.mode === "edit" ? `edit:${request.task.id}` : "create";
  return (
    <Modal
      visible={request != null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {request != null ? (
        <BottomSheet onDismiss={onClose}>
          {/* key remounts fresh state per opening (useState init, no effects). */}
          <SheetContent key={contentKey} request={request} day={day} gateRole={gateRole} onClose={onClose} />
        </BottomSheet>
      ) : null}
    </Modal>
  );
}
