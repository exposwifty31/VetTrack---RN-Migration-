/**
 * Container list row (G3 Slice 10) — an OPAQUE Aurora card (`SectionCard`, no
 * glass), the container name written `ltr` (equipment-name idiom), the on-shelf
 * aggregate vs blueprint target as LTR numerals, and two ≥44pt actions. Motion
 * is PressableScale press feedback only (the buttons); the card never animates
 * content/layout.
 */
import { memo, useCallback } from "react";
import { Text, View } from "react-native";

import { PrimaryButton, QuietButton } from "@/components/equipment/detail/DetailBits";
import { SectionCard } from "@/components/ui/SectionCard";
import type { ContainerListItem } from "@/types/containers";

type ContainerRowProps = Readonly<{
  container: ContainerListItem;
  dispenseLabel: string;
  restockLabel: string;
  onShelfLabel: string;
  targetLabel: string;
  onDispense: (container: ContainerListItem) => void;
  onRestock: (container: ContainerListItem) => void;
}>;

function ContainerRowComponent({
  container,
  dispenseLabel,
  restockLabel,
  onShelfLabel,
  targetLabel,
  onDispense,
  onRestock,
}: ContainerRowProps) {
  const onDispensePress = useCallback(() => onDispense(container), [onDispense, container]);
  const onRestockPress = useCallback(() => onRestock(container), [onRestock, container]);

  return (
    <SectionCard className="mb-2.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text
            className="font-rubik-semibold text-[15px] text-foreground"
            style={{ writingDirection: "ltr" }}
            numberOfLines={2}
          >
            {container.name}
          </Text>
          {container.department ? (
            <Text className="mt-0.5 font-rubik text-[12px] text-muted" numberOfLines={1}>
              {container.department}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="font-rubik text-[11px] text-text-tertiary">{onShelfLabel}</Text>
          <Text
            className="font-rubik-semibold text-[15px] text-foreground"
            style={{ writingDirection: "ltr" }}
          >
            {`${container.currentQuantity} / ${container.targetQuantity}`}
          </Text>
          <Text className="font-rubik text-[11px] text-text-tertiary">{targetLabel}</Text>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2.5">
        <View className="flex-1">
          <PrimaryButton label={dispenseLabel} onPress={onDispensePress} />
        </View>
        <View className="flex-1">
          <QuietButton label={restockLabel} onPress={onRestockPress} />
        </View>
      </View>
    </SectionCard>
  );
}

export const ContainerRow = memo(ContainerRowComponent);
