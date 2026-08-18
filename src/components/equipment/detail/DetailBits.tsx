/**
 * Small shared presentational pieces for the detail sections — label/value
 * rows, section titles, and the two button recipes (primary violet gradient =
 * the CheckoutConfirm CTA grammar; quiet surface = the ErrorNote retry
 * grammar). All opaque, ≥44pt, press-scale only (never on danger surfaces —
 * none of these render danger fills).
 */
import { Text, View } from "react-native";

import { PressableScale } from "@/components/PressableScale";

/**
 * FSI/PDI-isolate a Latin value (email, id) inside an RTL sentence — the
 * EquipmentRow idiom, promoted so every section renders emails identically.
 */
export function ltrIsolate(value: string): string {
  return `⁦${value}⁩`;
}

export function SectionTitle({ title }: Readonly<{ title: string }>) {
  return <Text className="mb-2 font-rubik-bold text-[15px] text-foreground">{title}</Text>;
}

export function KeyValueRow({
  label,
  value,
  ltr = false,
}: Readonly<{ label: string; value: string; ltr?: boolean }>) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-1">
      <Text className="font-rubik text-[13px] text-muted">{label}</Text>
      {/* text-right flips to logical end under RN's RTL left/right swap. */}
      <Text
        className="flex-1 text-right font-rubik text-[13px] text-foreground"
        style={ltr ? { writingDirection: "ltr" } : undefined}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

type ButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}>;

export function PrimaryButton({ label, onPress, disabled, testID }: ButtonProps) {
  return (
    <PressableScale
      className="overflow-hidden rounded-[20px]"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
    >
      <View
        className="min-h-[48px] items-center justify-center rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-3"
        style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
      >
        {/* AA: solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
        <Text className="font-rubik-semibold text-[16px] text-white">{label}</Text>
      </View>
    </PressableScale>
  );
}

export function QuietButton({ label, onPress, disabled, testID }: ButtonProps) {
  return (
    <PressableScale
      className="min-h-[48px] items-center justify-center rounded-[20px] border border-border bg-surface px-5 py-3"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[15px] text-foreground">{label}</Text>
    </PressableScale>
  );
}
