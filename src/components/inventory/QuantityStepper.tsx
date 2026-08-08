/**
 * LTR quantity stepper (G3 Slice 10) — a [−] value [+] control. The numerals
 * are always `ltr` (RTL bar reads right-to-left but numbers stay LTR). The
 * buttons use PressableScale (non-danger press feedback); the value is a plain
 * clamped display, never an editable free-text field. Clamped to [0, max].
 */
import { memo, useCallback } from "react";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/PressableScale";

import { normalizeStepperRange } from "./quantity-normalize";

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
  // Normalize once so an out-of-range prop (NaN / negative / value>max) can never
  // render an invalid quantity or emit one — both buttons step off the clamped
  // value inside `[0, upperBound]`.
  const { value: clampedValue, upperBound } = normalizeStepperRange(value, max);
  const decrement = useCallback(
    () => onChange(Math.max(0, clampedValue - 1)),
    [onChange, clampedValue],
  );
  const increment = useCallback(
    () => onChange(Math.min(upperBound, clampedValue + 1)),
    [onChange, clampedValue, upperBound],
  );

  return (
    // Fixed LTR direction so [−] value [+] reads consistently regardless of locale.
    <View className="flex-row items-center gap-2" style={{ direction: "ltr" }}>
      <PressableScale
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        disabled={clampedValue <= 0}
        onPress={decrement}
      >
        <Text className="font-rubik-bold text-[18px] text-foreground">−</Text>
      </PressableScale>
      <Text
        className="min-w-[28px] text-center font-rubik-semibold text-[16px] text-foreground"
        style={{ writingDirection: "ltr" }}
      >
        {clampedValue}
      </Text>
      <PressableScale
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        disabled={clampedValue >= upperBound}
        onPress={increment}
      >
        <Text className="font-rubik-bold text-[18px] text-foreground">+</Text>
      </PressableScale>
    </View>
  );
}

export const QuantityStepper = memo(QuantityStepperComponent);
