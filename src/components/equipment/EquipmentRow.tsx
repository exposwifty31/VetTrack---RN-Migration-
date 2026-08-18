/**
 * Aurora equipment row — three-tier text on an OPAQUE `--color-surface` card
 * (direction-1c-aurora.md: "three-tier equipment rows always sit on opaque
 * --color-surface"; rows never sit on glass). Status line renders in the
 * STATUS color: success = זמין, warning = מושאל (holder email LTR-isolated).
 * Light theme keeps the base status tokens — both pass AA on white surface
 * (success 5.02 / warning 5.02, spec AA table).
 *
 * Module-scope + memo: a stable renderItem keeps FlashList recycling cheap.
 */
import { memo } from "react";
import { Text } from "react-native";
import { useT, type TFn } from "@/types/tfn";

import { PressableScale } from "@/components/PressableScale";
import { haptics } from "@/lib/haptics";
import type { EquipmentRow as EquipmentRowType } from "@/types/api";

import { equipmentRowMeta, equipmentRowStatus } from "./equipment-row-status";

export type RowPressHandler = (item: EquipmentRowType) => void;

function metaLabel(
  meta: NonNullable<ReturnType<typeof equipmentRowMeta>>,
  t: TFn,
): string {
  if (meta.kind === "never_seen") return t("equipment.neverSeen");
  if (meta.days === 0) return t("equipment.seenToday");
  if (meta.days === 1) return t("equipment.seenYesterday");
  return t("equipment.seenDaysAgo", { days: meta.days });
}

export const EquipmentRow = memo(function EquipmentRow({
  item,
  onPress,
  sampledAtMs,
}: Readonly<{
  item: EquipmentRowType;
  onPress: RowPressHandler;
  /** "Now" for the stale meta tier = when the list data landed (dataUpdatedAt). */
  sampledAtMs: number;
}>) {
  const t = useT();
  const status = equipmentRowStatus(item);
  const meta = equipmentRowMeta(item.lastSeen, sampledAtMs);

  return (
    <PressableScale
      className="mb-2.5 min-h-[56px] justify-center rounded-[20px] border border-border bg-surface px-4 py-3"
      accessibilityRole="button"
      onPress={() => {
        haptics.tap();
        onPress(item);
      }}
    >
      <Text
        className="font-rubik-semibold text-[16px] text-foreground"
        numberOfLines={1}
        style={{ writingDirection: "ltr" }}
      >
        {item.name}
      </Text>
      {status.kind === "available" ? (
        <Text className="mt-[2px] font-rubik text-[13px] text-success" numberOfLines={1}>
          {t("equipment.available")}
        </Text>
      ) : (
        <Text className="mt-[2px] font-rubik text-[13px] text-warning" numberOfLines={1}>
          {status.kind === "held_by"
            ? // FSI/PDI isolate the LTR email inside the RTL sentence (home-card idiom).
              t("equipment.checkedOutBy", { email: `⁦${status.email}⁩` })
            : t("equipment.held")}
        </Text>
      )}
      {meta ? (
        // Stale = --color-stale (light token is already the on-tint #A21CAF).
        // Never-seen stays tertiary — the exceptions logic does not count it
        // as stale, so the color must not claim it either. Static color, no
        // animation: status/content changes on list rows never animate.
        <Text
          className={`mt-[2px] font-rubik text-[12px] ${
            meta.kind === "seen" && meta.stale ? "text-stale" : "text-text-tertiary"
          }`}
          numberOfLines={1}
        >
          {metaLabel(meta, t)}
        </Text>
      ) : null}
    </PressableScale>
  );
});
