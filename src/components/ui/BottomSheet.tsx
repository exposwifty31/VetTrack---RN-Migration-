/**
 * Reusable sheet primitive — the CheckoutConfirm sheet mechanics, verbatim:
 * Gesture Handler `Pan` + Reanimated rise (`SPRING`, ~380ms envelope), plain
 * 200ms dim backdrop (NEVER a blur layer — the T2 budget is spent on the
 * sheet), drag-down past 120 to dismiss, radius-sheet top corners.
 *
 * Aurora glass budget: the sheet body is the screen's ONE sanctioned blur
 * layer (T2 — `--color-glass-strong` tint over BlurView). Do not host a second
 * blur on any screen that mounts this. Mount inside a `transparentModal` route
 * (the CheckoutConfirm registration pattern).
 *
 * CheckoutConfirm itself deliberately does NOT consume this primitive yet —
 * that adoption is post-G3 (it carries G2 measurement call sites that must not
 * move in this slice).
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useUniwind } from "uniwind";

import { DURATION, SPRING } from "@/lib/motion";

const DISMISS_THRESHOLD = 120;

/**
 * Glass T2 blur strength — same mapping CheckoutConfirm established: the spec's
 * CSS `blur(30px)` ≈ expo-blur intensity 55 (T1's 22px ≈ 40). Android renders
 * the tint-only fallback (`blurMethod` default `'none'`) — documented
 * degradation, AA intact; real Android blur is deferred to the Android lane.
 */
const T2_BLUR_INTENSITY = 55;

type BottomSheetProps = Readonly<{
  /** Called after a drag-down past the threshold — typically `navigation.goBack`. */
  onDismiss: () => void;
  children: ReactNode;
}>;

export function BottomSheet({ onDismiss, children }: BottomSheetProps) {
  const { theme } = useUniwind();
  const light = theme === "light";

  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Backdrop dim + sheet fade ride the same 200ms envelope; the rise is the
    // spec's ~380ms spring (stiffness 260 / damping 26).
    opacity.value = withTiming(1, { duration: DURATION.fast });
    translateY.value = withSpring(0, SPRING);
  }, [opacity, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Drag-down to dismiss. Vertical gesture → no RTL mirroring needed.
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      "worklet";
      if (e.translationY > DISMISS_THRESHOLD) {
        scheduleOnRN(onDismiss);
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  return (
    <View className="flex-1 justify-end">
      {/* Plain dim overlay — never a blur layer. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, backdropStyle]}
        className="bg-black/40"
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={sheetStyle}
          className="overflow-hidden rounded-t-[36px] border border-[rgba(167,139,250,0.20)] light:border-border"
        >
          <BlurView
            intensity={T2_BLUR_INTENSITY}
            tint={light ? "light" : "dark"}
            style={StyleSheet.absoluteFill}
          />
          <View className="bg-glass-strong px-6 pb-10 pt-4">
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-[rgba(243,241,250,0.28)] light:bg-[rgba(23,19,49,0.18)]" />
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
