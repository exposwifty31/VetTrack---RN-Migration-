/**
 * Recent-activity feed pieces (G3 Slice 5) — split for the HomeScreen's
 * top-level FlashList (rn-best-practices: virtualized list, never `map` an
 * unbounded feed inside a ScrollView):
 *   - `ActivityRow`     → FlashList `renderItem` (recycled, opaque row —
 *     the EquipmentRow standalone-row grammar)
 *   - `ActivitySectionHeader` → tail of `ListHeaderComponent` (title +
 *     honest loading/empty/error states)
 *   - `ActivityLoadMoreFooter` → `ListFooterComponent` ("load more" is an
 *     explicit user action driving `fetchNextPage()` — never a poll)
 *
 * Aurora: rows are LIST ROWS — no content/layout animation, static pressed
 * style only. Equipment names + emails render inside LTR isolates;
 * timestamps via datetime.ts.
 */
import { memo } from "react";
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

export const ActivityRow = memo(function ActivityRow({
  item,
  onPress,
}: Readonly<{
  item: ActivityItem;
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
      className="mx-[22px] mb-2.5 min-h-[56px] flex-row items-center gap-[11px] rounded-md border border-border bg-surface px-4 py-3 active:opacity-80"
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
});

export function ActivitySectionHeader({
  items,
  loadFailed,
  onRetry,
}: Readonly<{
  /** null = still loading (honest loading line, never a fabricated empty). */
  items: ActivityItem[] | null;
  loadFailed: boolean;
  onRetry: () => void;
}>) {
  const { t } = useTranslation();

  let stateLine: string | null = null;
  if (items == null) {
    stateLine = loadFailed ? t("home.activity.loadError") : t("common.loading");
  } else if (items.length === 0) {
    stateLine = loadFailed ? t("home.activity.loadError") : t("home.activity.empty");
  } else if (loadFailed) {
    // Rows exist but a refetch failed — say so instead of silently going stale.
    stateLine = t("home.activity.loadError");
  }

  return (
    <View className="pb-1 pt-3">
      <Text className="px-[26px] pb-2 font-rubik-semibold text-[12.5px] text-text-tertiary">
        {t("home.activity.title")}
      </Text>
      {stateLine ? (
        <Text className="px-[26px] pb-2 text-center font-rubik text-[11.5px] text-muted">
          {stateLine}
        </Text>
      ) : null}
      {loadFailed && (items == null || items.length === 0) ? (
        <View className="px-[22px] pb-1">
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
  );
}

export function ActivityLoadMoreFooter({
  hasMore,
  loadingMore,
  onLoadMore,
}: Readonly<{
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}>) {
  if (!hasMore) return null;
  return <LoadMoreButton loadingMore={loadingMore} onLoadMore={onLoadMore} />;
}

function LoadMoreButton({
  loadingMore,
  onLoadMore,
}: Readonly<{ loadingMore: boolean; onLoadMore: () => void }>) {
  const { t } = useTranslation();
  return (
    <View className="px-[22px] pb-2 pt-0.5">
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
  );
}
