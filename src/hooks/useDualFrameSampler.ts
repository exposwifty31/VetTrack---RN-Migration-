import { useCallback, useEffect, useRef } from "react";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

import {
  getFrameBudgetMs,
  publishFrameSample,
  startFrameSampler,
} from "@/lib/instrumentation/perf";

/**
 * Dual-thread frame sampler for the G2 gate (O1/O2): a JS-thread rAF delta
 * sampler PLUS a Reanimated `useFrameCallback` UI-thread accumulator, published
 * to the perf sink SEPARATELY (never merged). Segments published within one
 * measurement run concatenate in the sink (scroll + hero transition = one run).
 *
 * Budget comes from `EXPO_PUBLIC_FRAME_BUDGET_MS` (1000 / measured refresh Hz).
 * When unset, deltas are still retained (they are the raw truth the archived
 * JSON needs) but no frame is counted over-budget — the measurement screen
 * fails loud on a missing budget before any verdict export.
 */
export function useDualFrameSampler() {
  const budgetMs = getFrameBudgetMs() ?? Number.POSITIVE_INFINITY;

  const uiFramesTotal = useSharedValue(0);
  const uiFramesOverBudget = useSharedValue(0);
  const uiDeltas = useSharedValue<number[]>([]);

  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    const delta = frame.timeSincePreviousFrame;
    if (delta != null) {
      uiFramesTotal.value += 1;
      if (delta > budgetMs) uiFramesOverBudget.value += 1;
      uiDeltas.modify((arr) => {
        "worklet";
        arr.push(delta);
        return arr;
      });
    }
  }, false);
  // Stable handle so stable start/stop callbacks never re-run consumer effects.
  const frameCallbackRef = useRef(frameCallback);
  useEffect(() => {
    frameCallbackRef.current = frameCallback;
  }, [frameCallback]);

  const jsHandle = useRef<ReturnType<typeof startFrameSampler> | null>(null);

  const start = useCallback(() => {
    if (jsHandle.current) return; // already sampling — idempotent
    uiFramesTotal.value = 0;
    uiFramesOverBudget.value = 0;
    uiDeltas.value = [];
    jsHandle.current = startFrameSampler(budgetMs);
    frameCallbackRef.current.setActive(true);
  }, [budgetMs, uiFramesTotal, uiFramesOverBudget, uiDeltas]);

  const stop = useCallback(() => {
    const handle = jsHandle.current;
    if (!handle) return; // not sampling — idempotent
    jsHandle.current = null;
    frameCallbackRef.current.setActive(false);
    publishFrameSample("js", handle.stop());
    // Snapshot the delta array ONCE and derive both counters from it: the
    // separate shared-value reads are not atomic against a still-settling
    // UI-thread frame (observed as a one-frame counter/array mismatch in the
    // G2.5 run-04 archive). The array is the reproducibility ground truth.
    const deltasMs = [...uiDeltas.value];
    publishFrameSample("ui", {
      framesTotal: deltasMs.length,
      framesOverBudget: deltasMs.filter((d) => d > budgetMs).length,
      deltasMs,
    });
  }, [budgetMs, uiDeltas]);

  // Never leave the UI frame callback running after unmount.
  useEffect(() => stop, [stop]);

  return { start, stop, budgetMs };
}
