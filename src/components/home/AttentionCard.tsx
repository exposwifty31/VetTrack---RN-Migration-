/**
 * "דורש תשומת לב" card (README.md §5) — two states with a state-colored border:
 *   - empty  = GOOD NEWS: success ring + checkmark ("הכל תחת שליטה").
 *   - populated = overdue/maintenance rows with status-tinted "!" icons.
 * `items: null` (not loaded / fetch failed) renders a muted loading line —
 * never a fabricated all-clear. Rows are LIST ROWS: no scale animation
 * (motion doctrine), static pressed style only.
 */
import { I18nManager, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import type { AttentionItem } from "@/lib/home-readiness";

const MAX_ROWS = 4;

// Forward-pointing chevron: layout direction is fixed at boot (rtl-bootstrap),
// so a module-level constant is safe.
const FORWARD_CHEVRON = I18nManager.isRTL ? "‹" : "›";

function formatDueTime(dueAtMs: number, locale: string): string {
  try {
    // Prefix match: i18n.language may carry a region subtag (e.g. "he-IL").
    return new Intl.DateTimeFormat(locale.startsWith("he") ? "he-IL" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dueAtMs));
  } catch {
    return "";
  }
}

function AttentionRow({
  item,
  first,
  onPress,
}: {
  item: AttentionItem;
  first: boolean;
  onPress: (item: AttentionItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  const overdue = item.severity === "overdue";
  const iconBg = overdue
    ? light
      ? "rgba(185,28,28,0.10)"
      : "rgba(248,113,113,0.14)"
    : light
      ? "rgba(180,83,9,0.10)"
      : "rgba(251,191,36,0.12)";
  const statusColor = overdue ? (light ? "#B91C1C" : "#F87171") : light ? "#92400E" : "#FBBF24";

  const parts: string[] = [];
  if (overdue) {
    parts.push(t("aurora.overdueLine"));
    if (item.holder) parts.push(`⁦${item.holder}⁩`);
    if (item.dueAtMs != null) {
      const time = formatDueTime(item.dueAtMs, i18n.language);
      if (time) parts.push(t("aurora.overdueDue", { time: `⁦${time}⁩` }));
    }
  } else {
    parts.push(t("aurora.maintenanceLine"));
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      className={`min-h-[48px] flex-row items-center gap-[11px] px-5 py-[9px] active:opacity-80 ${
        first ? "" : "border-t border-[rgba(167,139,250,0.08)] light:border-[#F0EDF8]"
      }`}
    >
      <View
        className="h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg }}
      >
        <Text className="font-rubik-bold text-[12.5px]" style={{ color: statusColor }}>
          !
        </Text>
      </View>
      <View className="flex-1">
        <Text
          className="font-rubik-semibold text-[13.5px] text-foreground"
          numberOfLines={1}
          style={{ writingDirection: "ltr" }}
        >
          {item.equipmentName}
        </Text>
        <Text className="mt-[1px] font-rubik text-[11.5px]" style={{ color: statusColor }} numberOfLines={1}>
          {parts.join(" · ")}
        </Text>
      </View>
      <Text className="font-rubik text-[15px] text-text-tertiary">{FORWARD_CHEVRON}</Text>
    </Pressable>
  );
}

export function AttentionCard({
  items,
  loadFailed = false,
  onItemPress,
}: {
  items: AttentionItem[] | null;
  /** Fetch failed — render an honest load-error line, never a fake all-clear. */
  loadFailed?: boolean;
  onItemPress: (item: AttentionItem) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  const borderClass =
    items == null
      ? "border-border"
      : items.length === 0
        ? "border-[rgba(74,222,128,0.20)] light:border-[rgba(21,128,61,0.22)]"
        : "border-[rgba(248,113,113,0.25)] light:border-[rgba(185,28,28,0.25)]";

  return (
    <View className="px-[22px] pt-2.5">
      <View
        className={`overflow-hidden rounded-[24px] border bg-surface ${borderClass}`}
        style={{ boxShadow: light ? "0 8px 20px rgba(23,19,49,0.04)" : undefined }}
      >
        <Text className="px-5 pb-0.5 pt-3 font-rubik-semibold text-[12.5px] text-text-tertiary">
          {t("aurora.attentionTitle")}
        </Text>

        {items == null ? (
          <Text className="px-5 pb-4 pt-2 text-center font-rubik text-[11.5px] text-muted">
            {loadFailed ? t("equipment.loadError") : t("common.loading")}
          </Text>
        ) : items.length === 0 ? (
          <View className="items-center gap-1.5 px-5 pb-3.5 pt-2.5">
            <View className="h-[38px] w-[38px] items-center justify-center rounded-full border-[1.5px] border-[rgba(74,222,128,0.35)] bg-[rgba(74,222,128,0.08)] light:border-[rgba(21,128,61,0.30)] light:bg-[rgba(21,128,61,0.08)]">
              <View
                className="h-[7px] w-[13px] border-b-[2.5px] border-l-[2.5px] border-success"
                style={{ transform: [{ rotate: "-45deg" }], marginTop: -3 }}
              />
            </View>
            <Text className="font-rubik-semibold text-[14px] text-foreground">
              {t("aurora.allClearTitle")}
            </Text>
            <Text className="font-rubik text-[11.5px] text-muted">{t("aurora.allClearSubtitle")}</Text>
          </View>
        ) : (
          <View className="pb-1">
            {items.slice(0, MAX_ROWS).map((item, i) => (
              <AttentionRow key={item.id} item={item} first={i === 0} onPress={onItemPress} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
