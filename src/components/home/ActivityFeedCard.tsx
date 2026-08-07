/**
 * Recent-activity feed (G3 Slice 5) — cursor-paged scan/transfer rows in one
 * opaque card. "Load more" is an explicit user action driving
 * `fetchNextPage()` (the HistoryCard idiom) — never a poll.
 *
 * Aurora: rows are LIST ROWS — no content/layout animation, static pressed
 * style only (the AttentionCard grammar). Equipment names + emails render
 * inside LTR isolates; timestamps via datetime.ts.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { ActivityItem } from "@/lib/api/home";
import { formatDateTime } from "@/lib/datetime";

import { FORWARD_CHEVRON } from "./glyphs";

/** FSI/PDI isolate (the DetailBits idiom) — Latin values in RTL sentences. */
function ltrIsolate(value: string): string {
  return `⁦${value}⁩`;
}

function ActivityRow({
  item,
  first,
  onPress,
}: Readonly<{
  item: ActivityItem;
  first: boolean;
  onPress: (item: ActivityItem) => void;
}>) {
  const { t } = useTranslation();
  const when = formatDateTime(item.timestamp);

  const metaParts: string[] = [
    item.type === "scan" ? t("home.activity.scan") : t("home.activity.transfer"),
  ];
  if (item.type === "transfer" && item.fromFolder && item.toFolder) {
    // Locale-directed route template — the arrow glyph belongs to the locale.
    metaParts.push(t("home.activity.transferRoute", { from: item.fromFolder, to: item.toFolder }));
  }
  if (when) metaParts.push(ltrIsolate(when));
  if (item.userEmail) metaParts.push(ltrIsolate(item.userEmail));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      className={`min-h-[48px] flex-row items-center gap-[11px] px-5 py-[9px] active:opacity-80 ${
        first ? "" : "border-t border-[rgba(167,139,250,0.08)] light:border-[#F0EDF8]"
      }`}
    >
      <View className="flex-1">
        <Text
          className="font-rubik-semibold text-[13.5px] text-foreground"
          numberOfLines={1}
          style={{ writingDirection: "ltr" }}
        >
          {item.equipmentName}
        </Text>
        <Text className="mt-[1px] font-rubik text-[11.5px] text-muted" numberOfLines={1}>
          {metaParts.join(" · ")}
        </Text>
      </View>
      <Text className="font-rubik text-[15px] text-text-tertiary">{FORWARD_CHEVRON}</Text>
    </Pressable>
  );
}

type ActivityFeedCardProps = Readonly<{
  /** null = still loading (honest loading line, never a fabricated empty). */
  items: ActivityItem[] | null;
  loadFailed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onItemPress: (item: ActivityItem) => void;
}>;

export function ActivityFeedCard({
  items,
  loadFailed,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  onItemPress,
}: ActivityFeedCardProps) {
  const { t } = useTranslation();

  let body: ReactNode;
  if (items == null) {
    body = (
      <Text className="px-5 pb-4 pt-2 text-center font-rubik text-[11.5px] text-muted">
        {loadFailed ? t("home.activity.loadError") : t("common.loading")}
      </Text>
    );
  } else if (items.length === 0) {
    body = (
      <Text className="px-5 pb-4 pt-2 text-center font-rubik text-[11.5px] text-muted">
        {t("home.activity.empty")}
      </Text>
    );
  } else {
    body = (
      <View className="pb-1">
        {items.map((item, i) => (
          <ActivityRow key={item.id} item={item} first={i === 0} onPress={onItemPress} />
        ))}
        {hasMore ? (
          <View className="px-5 pb-3 pt-1.5">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t("home.activity.loadMore")}
              accessibilityState={{ disabled: loadingMore }}
              disabled={loadingMore}
              className={`min-h-[44px] items-center justify-center rounded-[16px] border border-border bg-surface ${
                loadingMore ? "opacity-60" : ""
              }`}
              onPress={onLoadMore}
            >
              <Text className="font-rubik-semibold text-[13px] text-foreground">
                {t("home.activity.loadMore")}
              </Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="px-[22px] pt-2.5">
      <View className="overflow-hidden rounded-[24px] border border-border bg-surface">
        <Text className="px-5 pb-0.5 pt-3 font-rubik-semibold text-[12.5px] text-text-tertiary">
          {t("home.activity.title")}
        </Text>
        {loadFailed && items != null ? (
          <Text className="px-5 pb-1 text-center font-rubik text-[11.5px] text-danger">
            {t("home.activity.loadError")}
          </Text>
        ) : null}
        {body}
        {items == null && loadFailed ? (
          <View className="px-5 pb-3">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
              className="min-h-[44px] items-center justify-center rounded-[16px] border border-border bg-surface"
              onPress={onRetry}
            >
              <Text className="font-rubik-semibold text-[13px] text-foreground">
                {t("common.retry")}
              </Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </View>
  );
}
