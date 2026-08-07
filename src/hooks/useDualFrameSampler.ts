import { useCallback, useEffect, useRef } from "react";
import { runOnUI, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

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

/** Publish the UI-thread sample on the RN runtime (called via scheduleOnRN). */
function publishUiSample(deltasMs: number[], budgetMs: number): void {
  publishFrameSample("ui", {
    framesTotal: deltasMs.length,
    framesOverBudget: deltasMs.filter((d) => d > budgetMs).length,
    deltasMs,
  });
}

export function useDualFrameSampler() {
  const budgetMs = getFrameBudgetMs() ?? Number.POSITIVE_INFINITY;

  // The delta array is the single source of truth — counters are derived from
  // it at publish time (separate per-frame counters raced the array reads and
  // produced the G2.5 run-04 counter/array mismatch).
  const uiDeltas = useSharedValue<number[]>([]);

  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    const delta = frame.timeSincePreviousFrame;
    if (delta != null) {
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
    uiDeltas.value = [];
    jsHandle.current = startFrameSampler(budgetMs);
    frameCallbackRef.current.setActive(true);
  }, [budgetMs, uiDeltas]);

  const stop = useCallback(() => {
    const handle = jsHandle.current;
    if (!handle) return; // not sampling — idempotent
    jsHandle.current = null;
    frameCallbackRef.current.setActive(false);
    publishFrameSample("js", handle.stop());
    // Snapshot ON the UI runtime: its queue is serial, so this block runs after
    // the deactivation and after any still-pending frame callback — no trailing
    // frame can land after the capture. The sample is then published back on
    // the RN runtime in stop order.
    runOnUI(() => {
      "worklet";
      const deltasMs = uiDeltas.value.slice();
      scheduleOnRN(publishUiSample, deltasMs, budgetMs);
    })();
  }, [budgetMs, uiDeltas]);

  // Never leave the UI frame callback running after unmount.
  useEffect(() => stop, [stop]);

  return { start, stop, budgetMs };
}
