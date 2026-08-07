/**
 * Tasks + nudges chips (G3 Slice 5) — one compact pulse row under the hero.
 *
 * The tasks chip is the Home→Tasks entry point (Slice-1 pre-registered route);
 * the nudges chip is deliberately display-only — nudges have no dedicated
 * screen in G3 and inventing a navigation target here would be a guess.
 * Numbers render LTR; chips are opaque; overdue > 0 tints warning (never
 * animated — status colors are static per motion doctrine).
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { TasksDashboardCounts } from "@/lib/api/tasks";

import { FORWARD_CHEVRON } from "./glyphs";

function LtrNumber({
  value,
  className,
}: Readonly<{ value: number; className: string }>) {
  return (
    <Text className={className} style={{ writingDirection: "ltr" }}>
      {String(value)}
    </Text>
  );
}

type HomeChipsRowProps = Readonly<{
  /** null while loading or when the caller is off-shift (403 floor). */
  tasksCounts: TasksDashboardCounts | null;
  /** null while loading. */
  nudgesCount: number | null;
  onTasksPress: () => void;
}>;

export function HomeChipsRow({ tasksCounts, nudgesCount, onTasksPress }: HomeChipsRowProps) {
  const { t } = useTranslation();

  if (tasksCounts == null && nudgesCount == null) return null;

  return (
    <View className="flex-row gap-2.5 px-[22px] pt-2.5">
      {tasksCounts != null ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("home.chips.tasksA11y")}
          className="min-h-[44px] flex-1 flex-row items-center gap-2 rounded-[18px] border border-border bg-surface px-4 py-2.5"
          onPress={onTasksPress}
        >
          <Text className="font-rubik-semibold text-[13px] text-foreground">
            {t("home.chips.tasks")}
          </Text>
          <LtrNumber value={tasksCounts.today} className="font-rubik-bold text-[15px] text-foreground" />
          {tasksCounts.overdue > 0 ? (
            <Text className="font-rubik text-[12px] text-warning">
              {t("home.chips.tasksOverdue", { count: tasksCounts.overdue })}
            </Text>
          ) : null}
          <View className="flex-1" />
          <Text className="font-rubik text-[14px] text-text-tertiary">{FORWARD_CHEVRON}</Text>
        </PressableScale>
      ) : null}

      {nudgesCount != null ? (
        <View className="min-h-[44px] flex-row items-center gap-2 rounded-[18px] border border-border bg-surface px-4 py-2.5">
          <Text className="font-rubik-semibold text-[13px] text-foreground">
            {t("home.chips.nudges")}
          </Text>
          <LtrNumber
            value={nudgesCount}
            className={`font-rubik-bold text-[15px] ${nudgesCount > 0 ? "text-warning" : "text-muted"}`}
          />
        </View>
      ) : null}
    </View>
  );
}
