/**
 * Day navigation row — prev / label (+ back-to-today) / next. Chevrons are
 * direction-aware; layout direction is fixed at boot (rtl-bootstrap), so
 * module-level constants are safe.
 */
import { I18nManager, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { formatDayLabel, isoDayDate } from "@/lib/datetime";

const NEXT_CHEVRON = I18nManager.isRTL ? "‹" : "›";
const PREV_CHEVRON = I18nManager.isRTL ? "›" : "‹";

export function TasksDayNav({
  day,
  isToday,
  onShiftDay,
  onBackToToday,
}: Readonly<{
  day: string;
  isToday: boolean;
  onShiftDay: (delta: 1 | -1) => void;
  onBackToToday: () => void;
}>) {
  const { t, i18n } = useTranslation();
  const dayLabel = formatDayLabel(isoDayDate(day), i18n.language);

  return (
    <View className="mb-3 flex-row items-center gap-2.5">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("tasks.prevDay")}
        className="h-[44px] w-[44px] items-center justify-center rounded-[20px] border border-border bg-surface"
        onPress={() => onShiftDay(-1)}
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
          <PressableScale accessibilityRole="button" onPress={onBackToToday}>
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
        onPress={() => onShiftDay(1)}
      >
        <Text className="font-rubik-bold text-[20px] text-foreground">{NEXT_CHEVRON}</Text>
      </PressableScale>
    </View>
  );
}
