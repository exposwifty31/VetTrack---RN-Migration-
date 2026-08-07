/**
 * "חריגות" card (README.md §6) — count badge (danger-solid + white) and rows
 * whose reason line ("ללא סריקה ביותר מ־14 ימים") sits in tertiary. Rows are
 * list rows: static pressed style, no scale animation. The parent hides the
 * card entirely when there are zero exceptions (no invented empty state).
 */
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { EXCEPTION_STALE_DAYS, type ExceptionItem } from "@/lib/home-readiness";

import { FORWARD_CHEVRON } from "./glyphs";

const MAX_ROWS = 3;

export function ExceptionsCard({
  count,
  items,
  onHeaderPress,
  onItemPress,
}: Readonly<{
  count: number;
  items: ExceptionItem[];
  onHeaderPress: () => void;
  onItemPress: (item: ExceptionItem) => void;
}>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  const warnIconBg = light ? "rgba(180,83,9,0.10)" : "rgba(251,191,36,0.12)";
  const warnIconColor = light ? "#92400E" : "#FBBF24";

  return (
    <View className="px-[22px] pt-2.5">
      <View
        className="overflow-hidden rounded-[24px] border border-border bg-surface"
        style={{ boxShadow: light ? "0 8px 20px rgba(23,19,49,0.04)" : undefined }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onHeaderPress}
          className="flex-row items-center gap-2.5 px-5 pb-2 pt-3 active:opacity-80"
        >
          <Text className="font-rubik-bold text-[14.5px] text-foreground">
            {t("aurora.exceptionsTitle")}
          </Text>
          <View className="h-5 min-w-[26px] items-center justify-center rounded-full bg-danger-solid px-[7px]">
            <Text
              className="font-rubik-bold text-[11.5px] text-white"
              style={{ writingDirection: "ltr" }}
            >
              {String(count)}
            </Text>
          </View>
          <View className="flex-1" />
          <Text className="font-rubik text-[17px] text-text-tertiary">{FORWARD_CHEVRON}</Text>
        </Pressable>

        {items.slice(0, MAX_ROWS).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onItemPress(item)}
            className="min-h-[48px] flex-row items-center gap-[11px] border-t border-[rgba(167,139,250,0.08)] px-5 py-[9px] light:border-[#F0EDF8] active:opacity-80"
          >
            <View
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: warnIconBg }}
            >
              <Text className="font-rubik-bold text-[12.5px]" style={{ color: warnIconColor }}>
                !
              </Text>
            </View>
            <View className="flex-1">
              <Text
                className="font-rubik-semibold text-[13.5px] text-foreground"
                numberOfLines={1}
                style={{ writingDirection: "ltr" }}
              >
                {item.name}
              </Text>
              <Text className="mt-[1px] font-rubik text-[11.5px] text-text-tertiary" numberOfLines={1}>
                {t("aurora.exceptionReason", { days: EXCEPTION_STALE_DAYS })}
              </Text>
            </View>
            <Text className="font-rubik text-[15px] text-text-tertiary">{FORWARD_CHEVRON}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
