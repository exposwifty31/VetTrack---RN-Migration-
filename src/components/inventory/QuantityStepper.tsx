/**
 * LTR quantity stepper (G3 Slice 10) — a [−] value [+] control. The numerals
 * are always `ltr` (RTL bar reads right-to-left but numbers stay LTR). The
 * buttons use PressableScale (non-danger press feedback); the value is a plain
 * clamped display, never an editable free-text field. Clamped to [0, max].
 */
import { memo, useCallback } from "react";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/PressableScale";

type QuantityStepperProps = Readonly<{
  value: number;
  max: number;
  onChange: (next: number) => void;
  decrementLabel: string;
  incrementLabel: string;
}>;

function QuantityStepperComponent({
  value,
  max,
  onChange,
  decrementLabel,
  incrementLabel,
}: QuantityStepperProps) {
  const decrement = useCallback(() => onChange(Math.max(0, value - 1)), [onChange, value]);
  const increment = useCallback(() => onChange(Math.min(max, value + 1)), [onChange, value, max]);

  return (
    // Fixed LTR direction so [−] value [+] reads consistently regardless of locale.
    <View className="flex-row items-center gap-2" style={{ direction: "ltr" }}>
      <PressableScale
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        disabled={value <= 0}
        onPress={decrement}
      >
        <Text className="font-rubik-bold text-[18px] text-foreground">−</Text>
      </PressableScale>
      <Text
        className="min-w-[28px] text-center font-rubik-semibold text-[16px] text-foreground"
        style={{ writingDirection: "ltr" }}
      >
        {value}
      </Text>
      <PressableScale
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        disabled={value >= max}
        onPress={increment}
      >
        <Text className="font-rubik-bold text-[18px] text-foreground">+</Text>
      </PressableScale>
    </View>
  );
}

export const QuantityStepper = memo(QuantityStepperComponent);
