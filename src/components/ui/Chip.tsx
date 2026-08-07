/** Semantic-token status label — static colors, never animated (see motion.ts). */
import { Text, View } from "react-native";

import { chipToneClasses, type ChipTone } from "./chip-tone";

type ChipProps = Readonly<{
  label: string;
  tone?: ChipTone;
}>;

export function Chip({ label, tone = "neutral" }: ChipProps) {
  const classes = chipToneClasses(tone);
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${classes.container}`}>
      <Text className={`font-rubik-semibold text-[12px] ${classes.text}`} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
