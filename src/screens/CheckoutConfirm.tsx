import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useIdentity } from "@/app/useIdentity";
import { useScanToggle } from "@/hooks/useScanToggle";
import { api, equipmentKeys } from "@/lib/api";
import {
  mark,
  MARK,
  publishFrameSample,
  startFrameSampler,
  type FrameSample,
} from "@/lib/instrumentation/perf";
import { canUndoScan } from "@/lib/roles";
import type { ScanResult } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

const DISMISS_THRESHOLD = 120;
// 60 Hz frame budget — the UI-thread sampler counts frames over this during the
// enter animation (reported separately from the JS-thread sampler, never merged).
const FRAME_BUDGET_MS = 16.67;

type Feedback = { tone: "success" | "error"; message: string } | null;

/**
 * Human-confirm gate — the delight surface the G2 gate measures. Built from Gesture
 * Handler `Pan` + Reanimated (no bottom-sheet lib in deps). Drag down past the
 * threshold dismisses. `(rn-design: AnimatedPressable + useSharedValue + withSpring,
 * on the UI thread.)`
 */
export function CheckoutConfirm({ route, navigation }: RootStackScreenProps<"ScanConfirm">) {
  const { t } = useTranslation();
  const { equipmentId, prefill } = route.params;

  const scan = useScanToggle();
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmedResult, setConfirmedResult] = useState<ScanResult | null>(null);

  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);
  // UI-thread jank accumulators for the animation (separate source from perf.ts's
  // JS-thread rAF sampler). Run on the UI thread via a worklet; total + over-budget
  // are both tracked so the published UI sample carries a real frame count.
  const uiFramesTotal = useSharedValue(0);
  const uiFramesOverBudget = useSharedValue(0);

  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    const delta = frame.timeSincePreviousFrame;
    if (delta != null) {
      uiFramesTotal.value += 1;
      if (delta > FRAME_BUDGET_MS) uiFramesOverBudget.value += 1;
    }
  }, true);
  // Keep a stable handle to the frame callback so the (stable) finalize callback
  // can stop it without re-running the enter-animation effect.
  const frameCallbackRef = useRef(frameCallback);
  useEffect(() => {
    frameCallbackRef.current = frameCallback;
  }, [frameCallback]);

  const dismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // JS-thread frame sampler (O1/O2) over the enter animation — reported SEPARATELY
  // from the UI-thread useFrameCallback accumulator above (never merged). When the
  // enter animation ends we stop BOTH samplers and publish each to its own sink.
  const jsFrameSample = useRef<FrameSample | null>(null);
  const finishSamplers = useCallback(
    (sampler: ReturnType<typeof startFrameSampler>) => {
      const js = sampler.stop();
      jsFrameSample.current = js;
      publishFrameSample("js", js);
      // Stop the UI-thread frame callback and publish its sample separately.
      frameCallbackRef.current.setActive(false);
      publishFrameSample("ui", {
        framesTotal: uiFramesTotal.value,
        framesOverBudget: uiFramesOverBudget.value,
      });
    },
    [uiFramesTotal, uiFramesOverBudget],
  );

  useEffect(() => {
    const sampler = startFrameSampler(FRAME_BUDGET_MS);
    // withTiming completion callback (worklet) hops to JS to close the sampler window.
    opacity.value = withTiming(1, { duration: 220 }, (finished) => {
      "worklet";
      if (finished) scheduleOnRN(finishSamplers, sampler);
    });
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    return () => {
      jsFrameSample.current = sampler.stop();
      frameCallbackRef.current.setActive(false);
    };
  }, [opacity, translateY, finishSamplers]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
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
        translateY.value = withSpring(0);
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

  return (
    <View className="flex-1 justify-end bg-black/40">
      <GestureDetector gesture={panGesture}>
        <Animated.View style={sheetStyle} className="rounded-t-3xl bg-surface px-6 pb-10 pt-4">
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-border" />

          <Text className="text-[20px] font-bold text-foreground">{t("confirm.title")}</Text>
          {prefill?.name ? (
            <Text className="mt-1 text-[16px] text-foreground">{prefill.name}</Text>
          ) : null}
          {prefill?.status ? (
            <Text className="mt-0.5 text-[13px] text-muted">{prefill.status}</Text>
          ) : null}

          {feedback ? (
            <Text
              className={`mt-3 text-[15px] font-semibold ${
                feedback.tone === "success" ? "text-info" : "text-danger"
              }`}
            >
              {feedback.message}
            </Text>
          ) : null}

          {confirmedResult?.kind === "ok" ? null : (
            <Pressable
              className="mt-5 items-center rounded-xl bg-primary py-3.5 active:opacity-80"
              accessibilityRole="button"
              disabled={scan.isPending}
              onPress={() => {
                void onConfirm();
              }}
            >
              <Text className="text-[15px] font-semibold text-primary-foreground">
                {t("confirm.confirm")}
              </Text>
            </Pressable>
          )}

          {showUndo ? (
            <Pressable
              className="mt-2 items-center rounded-xl border border-border py-3.5 active:opacity-80"
              accessibilityRole="button"
              onPress={() => {
                void onUndo();
              }}
            >
              <Text className="text-[15px] font-semibold text-foreground">{t("confirm.undo")}</Text>
            </Pressable>
          ) : (
            <Pressable
              className="mt-2 items-center rounded-xl border border-border py-3.5 active:opacity-80"
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
            >
              <Text className="text-[15px] font-semibold text-foreground">{t("confirm.cancel")}</Text>
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
