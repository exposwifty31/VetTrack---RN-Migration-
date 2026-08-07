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
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { haptics } from "@/lib/haptics";
import type { EquipmentRow as EquipmentRowType } from "@/types/api";

import { equipmentRowStatus } from "./equipment-row-status";

export type RowPressHandler = (item: EquipmentRowType) => void;

export const EquipmentRow = memo(function EquipmentRow({
  item,
  onPress,
}: Readonly<{
  item: EquipmentRowType;
  onPress: RowPressHandler;
}>) {
  const { t } = useTranslation();
  const status = equipmentRowStatus(item);

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
    </PressableScale>
  );
});
