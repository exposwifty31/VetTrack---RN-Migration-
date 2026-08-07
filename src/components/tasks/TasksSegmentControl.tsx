/** All / Mine segment chips — opaque surfaces, PressableScale feedback only. */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";

import type { TaskSegment } from "./tasks-derive";

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

export function TasksSegmentControl({
  segment,
  onChange,
}: Readonly<{ segment: TaskSegment; onChange: (segment: TaskSegment) => void }>) {
  const { t } = useTranslation();
  return (
    <View className="mb-2.5 flex-row gap-2.5">
      <SegmentChip
        label={t("tasks.segmentAll")}
        selected={segment === "all"}
        onPress={() => onChange("all")}
      />
      <SegmentChip
        label={t("tasks.segmentMine")}
        selected={segment === "mine"}
        onPress={() => onChange("mine")}
      />
    </View>
  );
}
