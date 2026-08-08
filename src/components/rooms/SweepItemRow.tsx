/**
 * One row in the sweep worklist / confirm-present checklist.
 *
 *   - Read view (not sweeping): item + bucket chip + a per-item "not found
 *     here" action (resting items only — a no-op on checked-out ones).
 *   - Sweep mode: resting items become a press-scale toggle (transform-only
 *     feedback — content/layout never animate); checked-out items stay
 *     read-only, D-9 "accounted".
 *
 * Opaque surface, never glass. Danger is never used as a fill here (the
 * `missing` bucket chip owns the danger token, statically).
 */
import { memo, useCallback } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ltrIsolate } from "@/components/equipment/detail/DetailBits";
import { PressableScale } from "@/components/PressableScale";
import { Chip } from "@/components/ui/Chip";
import type { SweepItem } from "@/lib/api/docking";

import { isNoStation, isSweepable, sweepBucketLabelKey, sweepBucketTone } from "./rooms-derive";

type SweepItemRowProps = Readonly<{
  item: SweepItem;
  sweeping: boolean;
  confirmed: boolean;
  onToggle: (id: string) => void;
  onNotFound: (id: string) => void;
  notFoundPending: boolean;
}>;

function CheckBox({ confirmed }: Readonly<{ confirmed: boolean }>) {
  return (
    <View
      className={`h-6 w-6 items-center justify-center rounded-full border ${
        confirmed ? "border-primary bg-primary" : "border-border bg-surface-raised"
      }`}
    >
      {confirmed ? (
        <Text className="font-rubik-bold text-[13px] text-primary-foreground">✓</Text>
      ) : null}
    </View>
  );
}

/** The muted subtitle: home station · in-use holder · no-station · accounted. */
function useRowSubtitle(item: SweepItem): string {
  const { t } = useTranslation();
  if (item.checkedOutById != null) {
    return item.checkedOutByEmail
      ? t("roomDetail.sweep.inUse", { who: ltrIsolate(item.checkedOutByEmail) })
      : t("roomDetail.sweep.accounted");
  }
  if (isNoStation(item)) return t("roomDetail.sweep.noStation");
  return item.homeDockName ?? t("roomDetail.sweep.noStation");
}

function RowBody({ item }: Readonly<{ item: SweepItem }>) {
  const { t } = useTranslation();
  const subtitle = useRowSubtitle(item);
  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between gap-2">
        {/* Equipment name is arbitrary clinic content → flows with layout. */}
        <Text className="flex-1 font-rubik-semibold text-[14px] text-foreground" numberOfLines={1}>
          {item.name}
        </Text>
        <Chip label={t(sweepBucketLabelKey(item.bucket))} tone={sweepBucketTone(item.bucket)} />
      </View>
      <Text className="mt-0.5 font-rubik text-[12px] text-muted" numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}

function SweepItemRowImpl({
  item,
  sweeping,
  confirmed,
  onToggle,
  onNotFound,
  notFoundPending,
}: SweepItemRowProps) {
  const { t } = useTranslation();
  const sweepable = isSweepable(item);
  const handleToggle = useCallback(() => onToggle(item.id), [onToggle, item.id]);
  const handleNotFound = useCallback(() => onNotFound(item.id), [onNotFound, item.id]);

  // Sweep mode + resting → whole row is a confirm-present toggle (press-scale).
  if (sweeping && sweepable) {
    return (
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        accessibilityLabel={item.name}
        className="mb-2 flex-row items-center gap-3 rounded-md border border-border bg-surface px-3 py-3"
        onPress={handleToggle}
      >
        <CheckBox confirmed={confirmed} />
        <RowBody item={item} />
      </PressableScale>
    );
  }

  return (
    <View className="mb-2 rounded-md border border-border bg-surface px-3 py-3">
      <RowBody item={item} />
      {/* Not-found-here — resting items only, read view only (immediate
          contradiction, distinct from the sweep-commit "missing" path). */}
      {!sweeping && sweepable ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("roomDetail.sweep.notFoundHere")}
          disabled={notFoundPending}
          className="mt-2 min-h-[36px] flex-row items-center justify-center gap-2 self-start rounded-full border border-border bg-surface-raised px-3 py-1.5"
          onPress={handleNotFound}
        >
          {notFoundPending ? <ActivityIndicator size="small" /> : null}
          <Text className="font-rubik-semibold text-[12px] text-warning">
            {t("roomDetail.sweep.notFoundHere")}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export const SweepItemRow = memo(SweepItemRowImpl);
