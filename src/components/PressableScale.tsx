/**
 * Aurora press primitive — scale to .96 with spring-back on release (the
 * signature "נוזלי" feel, `direction-1c-aurora.md` §Motion). Transform-only:
 * never animates color, blur, or layout.
 *
 * Hit-target guarantee: interactive elements must be ≥44pt. When the rendered
 * bounds come up short, `onLayout` pads the touch area with `hitSlop` so the
 * EFFECTIVE target reaches 44pt without changing the visual size.
 *
 * Do NOT use on emergency/Code Blue surfaces — those never animate. Give them
 * a static pressed style instead.
 */
import { useCallback, useState } from "react";
import type { LayoutChangeEvent, PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { PRESS_SCALE, SPRING } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MIN_HIT_TARGET_PT = 44;

type PressableScaleProps = Omit<PressableProps, "style"> & {
  className?: string;
  /** Plain style only (no function form) — it is merged with the scale transform. */
  style?: StyleProp<ViewStyle>;
};

export function PressableScale({
  onPressIn,
  onPressOut,
  onLayout,
  hitSlop,
  style,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const [autoHitSlop, setAutoHitSlop] = useState<
    { top: number; bottom: number; left: number; right: number } | undefined
  >(undefined);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      const padX = Math.max(0, (MIN_HIT_TARGET_PT - width) / 2);
      const padY = Math.max(0, (MIN_HIT_TARGET_PT - height) / 2);
      setAutoHitSlop((prev) => {
        if (padX === 0 && padY === 0) return prev === undefined ? prev : undefined;
        if (prev && prev.left === padX && prev.top === padY) return prev;
        return { top: padY, bottom: padY, left: padX, right: padX };
      });
      onLayout?.(e);
    },
    [onLayout],
  );

  return (
    <AnimatedPressable
      {...rest}
      style={[animatedStyle, style]}
      hitSlop={hitSlop ?? autoHitSlop}
      onLayout={handleLayout}
      onPressIn={(e) => {
        scale.value = withSpring(PRESS_SCALE, SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
        onPressOut?.(e);
      }}
    />
  );
}
