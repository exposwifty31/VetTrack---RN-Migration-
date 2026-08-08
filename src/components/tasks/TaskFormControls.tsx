/**
 * Presentational controls for the task create/edit sheet (Slice 3b) — extracted
 * so `TaskFormSheet` stays orchestration-only and each piece clears the
 * complexity limit. All opaque Aurora surfaces; press feedback is the sanctioned
 * `PressableScale` transform; NO content/layout animation. Numeric/clock rows
 * are pinned `direction:"ltr"` so the stepper order never mirrors under RTL, and
 * assignee labels are FSI/PDI-isolated for Latin names inside RTL copy.
 */
import { memo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { TaskPriority } from "@/types/tasks";

import type { AssigneeOption } from "./task-form-derive";

/** FSI…PDI isolate — a Latin name/email stays LTR inside RTL sentence flow. */
function ltrIsolate(value: string): string {
  return `⁦${value}⁩`;
}

export const StepButton = memo(function StepButton({
  label,
  a11yLabel,
  onPress,
}: Readonly<{ label: string; a11yLabel: string; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="h-11 min-w-[44px] items-center justify-center rounded-[14px] border border-border bg-surface px-2"
      onPress={onPress}
    >
      <Text
        className="font-rubik-semibold text-[13px] text-foreground"
        style={{ writingDirection: "ltr" }}
      >
        {label}
      </Text>
    </PressableScale>
  );
});

/** Label + a centered −1h/−15m · value · +15m/+1h clock stepper (LTR row). */
export function TimeStepperRow({
  label,
  value,
  onStep,
}: Readonly<{ label: string; value: string; onStep: (deltaMinutes: number) => void }>) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">{label}</Text>
      <View className="flex-row items-center justify-center gap-2" style={{ direction: "ltr" }}>
        <StepButton
          label={t("tasks.form.stepDownHour")}
          a11yLabel={t("tasks.form.stepDownHourA11y")}
          onPress={() => onStep(-60)}
        />
        <StepButton
          label={t("tasks.form.stepDown")}
          a11yLabel={t("tasks.form.stepDownA11y")}
          onPress={() => onStep(-15)}
        />
        <View className="min-w-[86px] items-center rounded-[16px] border border-border bg-surface-raised px-4 py-2.5">
          <Text
            className="font-rubik-bold text-[22px] text-foreground"
            style={{ writingDirection: "ltr" }}
          >
            {value}
          </Text>
        </View>
        <StepButton
          label={t("tasks.form.stepUp")}
          a11yLabel={t("tasks.form.stepUpA11y")}
          onPress={() => onStep(15)}
        />
        <StepButton
          label={t("tasks.form.stepUpHour")}
          a11yLabel={t("tasks.form.stepUpHourA11y")}
          onPress={() => onStep(60)}
        />
      </View>
    </View>
  );
}

/** Label + a −15m · duration · +15m stepper (LTR row). */
export function DurationStepperRow({
  label,
  valueLabel,
  onStep,
}: Readonly<{ label: string; valueLabel: string; onStep: (deltaMinutes: number) => void }>) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">{label}</Text>
      <View className="flex-row items-center justify-center gap-2" style={{ direction: "ltr" }}>
        <StepButton
          label={t("tasks.form.stepDown")}
          a11yLabel={t("tasks.form.durationDownA11y")}
          onPress={() => onStep(-15)}
        />
        <View className="min-w-[110px] items-center rounded-[16px] border border-border bg-surface-raised px-4 py-2.5">
          <Text
            className="font-rubik-bold text-[18px] text-foreground"
            style={{ writingDirection: "ltr" }}
          >
            {valueLabel}
          </Text>
        </View>
        <StepButton
          label={t("tasks.form.stepUp")}
          a11yLabel={t("tasks.form.durationUpA11y")}
          onPress={() => onStep(15)}
        />
      </View>
    </View>
  );
}

const PRIORITY_OPTIONS = [
  { value: "normal", labelKey: "tasks.priority.normal" },
  { value: "high", labelKey: "tasks.priority.high" },
  { value: "critical", labelKey: "tasks.priority.critical" },
] as const satisfies readonly { value: TaskPriority; labelKey: string }[];

/** Normal / High / Critical segmented select — selection is the violet accent, */
/** never a danger fill (the danger family is reserved for the cancel action). */
export function PrioritySegment({
  value,
  onChange,
}: Readonly<{ value: TaskPriority; onChange: (value: TaskPriority) => void }>) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">{t("tasks.form.priority")}</Text>
      <View className="flex-row gap-2">
        {PRIORITY_OPTIONS.map((option) => {
          const selected = option.value === value;
          const label = t(option.labelKey);
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-[16px] border px-2 py-2.5 ${
                selected
                  ? "border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)]"
                  : "border-border bg-surface"
              }`}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={`font-rubik-semibold text-[13px] ${selected ? "text-foreground" : "text-muted"}`}
              >
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function AssigneeChip({
  label,
  selected,
  onPress,
  onShiftMark,
}: Readonly<{ label: string; selected: boolean; onPress: () => void; onShiftMark?: boolean }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      className={`min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-[16px] border px-3.5 py-2.5 ${
        selected
          ? "border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)]"
          : "border-border bg-surface"
      }`}
      onPress={onPress}
    >
      {onShiftMark ? <View className="h-1.5 w-1.5 rounded-full bg-success" /> : null}
      <Text
        className={`font-rubik-semibold text-[13px] ${selected ? "text-foreground" : "text-muted"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Horizontal assignee picker: an "Unassigned" chip plus one chip per staffer
 * (on-shift first, marked with a success dot). Horizontal scroll never mirrors
 * wrongly — RTL flips the start edge natively.
 */
export function AssigneePicker({
  options,
  selectedId,
  onSelect,
  loading,
}: Readonly<{
  options: AssigneeOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  loading: boolean;
}>) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">{t("tasks.form.assignee")}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        <AssigneeChip
          label={t("tasks.form.unassigned")}
          selected={selectedId == null}
          onPress={() => onSelect(null)}
        />
        {options.map((option) => (
          <AssigneeChip
            key={option.id}
            label={ltrIsolate(option.label)}
            selected={option.id === selectedId}
            onShiftMark={option.onShift}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </ScrollView>
      {loading && options.length === 0 ? (
        <Text className="mt-1 font-rubik text-[11.5px] text-muted">{t("common.loading")}</Text>
      ) : null}
    </View>
  );
}
