import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useUniwind } from "uniwind";

import { useIdentity } from "@/app/useIdentity";
import { PressableScale } from "@/components/PressableScale";
import { useDualFrameSampler } from "@/hooks/useDualFrameSampler";
import { useScanToggle } from "@/hooks/useScanToggle";
import { api, equipmentKeys } from "@/lib/api";
import { mark, MARK } from "@/lib/instrumentation/perf";
import { DURATION, SPRING } from "@/lib/motion";
import { canUndoScan } from "@/lib/roles";
import type { ScanResult } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

const DISMISS_THRESHOLD = 120;

/**
 * Glass T2 blur strength. The spec's recipe is CSS `blur(30px)`; expo-blur
 * `intensity` is not px — the home top bar established 40 ≡ blur 22 (T1), so
 * T2's 30px maps to ~55.
 *
 * Android (documented degradation): `blurMethod` stays at its `'none'` default,
 * which renders the semi-transparent tint only — i.e. the `--color-glass-strong`
 * overlay without real blur. A true Android blur needs a `BlurTargetView`
 * WRAPPING the content to be blurred; behind this `transparentModal` that
 * content is the PREVIOUS navigator screen's subtree, which this screen cannot
 * wrap — wiring it means hosting a BlurTargetView around the navigator and
 * threading its ref. Deferred to the Android lane (this migration's G2/G2.5
 * gate is iOS-sim); the tint-only fallback keeps AA intact.
 */
const T2_BLUR_INTENSITY = 55;

type Feedback = { tone: "success" | "error"; message: string } | null;

/**
 * Human-confirm gate — the delight surface the G2 gate measures. Built from Gesture
 * Handler `Pan` + Reanimated (no bottom-sheet lib in deps). Drag down past the
 * threshold dismisses. `(rn-design: AnimatedPressable + useSharedValue + withSpring,
 * on the UI thread.)`
 *
 * Aurora surface: the sheet is glass T2 — the ONLY blur layer on this screen
 * (`--color-glass-strong` tint over BlurView, hairline border, radius-sheet top
 * corners). The backdrop dim stays a PLAIN overlay (fade = DURATION.fast per the
 * spec's "backdrop dim 200ms"). Error/success feedback is text-on-glass with the
 * light theme using the spec's one-step-darker on-tint values.
 */
export function CheckoutConfirm({ route, navigation }: RootStackScreenProps<"ScanConfirm">) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const { equipmentId, prefill } = route.params;

  const scan = useScanToggle();
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmedResult, setConfirmedResult] = useState<ScanResult | null>(null);

  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);
  // Dual-thread frame sampling (O1/O2) over the hero-transition segment — the
  // JS rAF sampler + UI-thread useFrameCallback, published separately and
  // concatenated in the sink with the FlashList scroll segment of the same run.
  const { start: startSamplers, stop: stopSamplers } = useDualFrameSampler();

  const dismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    startSamplers();
    // withTiming completion callback (worklet) hops to JS to close the sampler window.
    opacity.value = withTiming(1, { duration: DURATION.fast }, (finished) => {
      "worklet";
      if (finished) scheduleOnRN(stopSamplers);
    });
    // Sheet rise = the spec's ~380ms spring envelope (stiffness 260 / damping 26).
    translateY.value = withSpring(0, SPRING);
    return stopSamplers; // early dismiss still closes + publishes the segment
  }, [opacity, translateY, startSamplers, stopSamplers]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Backdrop dim rides the same 200ms envelope as the sheet fade.
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
        scheduleOnRN(dismiss);
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const applyResult = (result: ScanResult) => {
    setConfirmedResult(result);
    switch (result.kind) {
      case "ok":
        setFeedback({
          tone: "success",
          message:
            result.action === "checkout"
              ? t("confirm.checkedOut", { name: result.equipment.name })
              : t("confirm.returned", { name: result.equipment.name }),
        });
        break;
      case "conflict":
        setFeedback({
          tone: "error",
          message: result.checkedOutByEmail
            ? t("confirm.blocked", { email: result.checkedOutByEmail })
            : t("confirm.conflict"),
        });
        break;
      case "not_found":
        setFeedback({ tone: "error", message: t("confirm.notFound") });
        break;
      case "blocked_precondition":
        setFeedback({ tone: "error", message: t("confirm.failed") });
        break;
    }
  };

  const onConfirm = async () => {
    mark(MARK.scanTap);
    setFeedback(null);
    try {
      const result = await scan.mutateAsync(equipmentId);
      applyResult(result);
    } catch {
      // Network / AuthFetchError — online-only, fail loud.
      setFeedback({ tone: "error", message: t("confirm.onlineRequired") });
    }
  };

  const onUndo = async () => {
    if (confirmedResult?.kind !== "ok") return;
    try {
      const reverted = await api.equipment.revert(equipmentId, confirmedResult.undoToken);
      // revert returns the BARE updated row — reconcile it, then invalidate the
      // equipment caches so the list reflects the reverted custody immediately
      // (not only once the SSE event arrives).
      if (reverted?.id) {
        queryClient.setQueryData(equipmentKeys.detail(reverted.id), reverted);
      }
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
      navigation.goBack();
    } catch {
      setFeedback({ tone: "error", message: t("confirm.failed") });
    }
  };

  const showUndo =
    confirmedResult?.kind === "ok" && canUndoScan(identity.data?.effectiveRole);

  const quietButtonClass =
    "mt-2.5 min-h-[48px] items-center justify-center rounded-[20px] border border-[rgba(167,139,250,0.28)] light:border-[rgba(23,19,49,0.14)]";

  return (
    <View className="flex-1 justify-end">
      {/* Plain dim overlay — never a blur layer (T2 budget is spent on the sheet). */}
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

            <Text className="font-rubik-bold text-[20px] text-foreground">
              {t("confirm.title")}
            </Text>
            {prefill?.name ? (
              <Text
                className="mt-1.5 font-rubik-medium text-[16px] text-foreground"
                numberOfLines={2}
                style={{ writingDirection: "ltr" }}
              >
                {prefill.name}
              </Text>
            ) : null}
            {prefill?.status ? (
              <Text
                className="mt-0.5 font-rubik text-[13px] text-text-tertiary"
                style={{ writingDirection: "ltr" }}
              >
                {prefill.status}
              </Text>
            ) : null}

            {feedback ? (
              <Text
                className={`mt-3 font-rubik-semibold text-[15px] ${
                  feedback.tone === "success"
                    ? // Light on-tint success (#166534) per the chip-on-tint AA rule.
                      "text-success light:text-[#166534]"
                    : // Danger family — light on-tint #B91C1C; never glassed itself.
                      "text-danger light:text-[#B91C1C]"
                }`}
              >
                {feedback.message}
              </Text>
            ) : null}

            {confirmedResult?.kind === "ok" ? null : (
              <PressableScale
                className="mt-5 overflow-hidden rounded-[20px]"
                accessibilityRole="button"
                disabled={scan.isPending}
                onPress={() => {
                  void onConfirm();
                }}
              >
                <View
                  className="min-h-[48px] items-center justify-center rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-3"
                  style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
                >
                  <Text className="font-rubik-semibold text-[16px] text-white">
                    {t("confirm.confirm")}
                  </Text>
                </View>
              </PressableScale>
            )}

            {showUndo ? (
              <PressableScale
                className={quietButtonClass}
                accessibilityRole="button"
                onPress={() => {
                  void onUndo();
                }}
              >
                <Text className="font-rubik-semibold text-[15px] text-foreground">
                  {t("confirm.undo")}
                </Text>
              </PressableScale>
            ) : (
              <PressableScale
                className={quietButtonClass}
                accessibilityRole="button"
                onPress={() => navigation.goBack()}
              >
                <Text className="font-rubik-semibold text-[15px] text-foreground">
                  {t("confirm.cancel")}
                </Text>
              </PressableScale>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
