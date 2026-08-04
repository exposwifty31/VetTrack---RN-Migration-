/**
 * G2 measurement harness — three DISTINCT capture mechanisms, reported separately:
 *   1. Cold TTI (O4)         — react-native-performance native launch marks.
 *   2. Tap latency (O3)      — `scan_tap` → `scan_visual_ack` (perceived, optimistic
 *                              commit) plus `scan_server_confirmed` (network) for diagnostics.
 *   3. Frame jank (O1/O2)    — a JS-thread requestAnimationFrame delta sampler PLUS a
 *                              Reanimated `useFrameCallback` UI-thread accumulator.
 *
 * `(rn-best-practices)`: cold-TTI is only measurable via react-native-performance;
 * frame time is NOT mark-measurable → rAF/useFrameCallback samplers. JS-thread and
 * UI-thread jank are kept in separate counters and never merged.
 *
 * Every function is defensive: the native module and rAF are absent under jest and
 * on some hosts, so nothing here throws — a missing source returns null / a zero
 * sample. Real gate numbers come from a release build on a physical device; the
 * simulator/dev wiring here only proves the markers emit.
 */
import performance from "react-native-performance";

// --- Mark names (bounded vocabulary — no free-form labels). ---
export const MARK = {
  scanTap: "scan_tap",
  scanVisualAck: "scan_visual_ack",
  scanServerConfirmed: "scan_server_confirmed",
  screenInteractive: "screenInteractive",
} as const;

export type MarkName = (typeof MARK)[keyof typeof MARK];

/** Emit a performance mark. No-op if the module is unavailable. */
export function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // marks are best-effort instrumentation
  }
}

/** Duration in ms between two prior marks, or null if either is missing. */
export function measureBetween(startMark: string, endMark: string): number | null {
  try {
    const measureName = `${startMark}__to__${endMark}`;
    const m = performance.measure(measureName, startMark, endMark);
    return typeof m?.duration === "number" ? m.duration : null;
  } catch {
    return null;
  }
}

/**
 * Cold TTI (O4): nativeLaunchStart → screenInteractive. Cold + foreground only —
 * the caller must discard warm/hot/prewarm launches. Returns null off-device.
 */
export function measureTTI(): number | null {
  try {
    const launch = performance
      .getEntriesByType("react-native-mark")
      .find((e) => e.name === "nativeLaunchStart");
    const interactiveMarks = performance.getEntriesByName(MARK.screenInteractive);
    const interactive = interactiveMarks[interactiveMarks.length - 1];
    if (!launch || !interactive) return null;
    return interactive.startTime - launch.startTime;
  } catch {
    return null;
  }
}

/** Perceived tap latency (O3 floor): scan_tap → scan_visual_ack. */
export function measureTapVisualAck(): number | null {
  return measureBetween(MARK.scanTap, MARK.scanVisualAck);
}

/** Network-bound tap latency (diagnostic only, NOT the O3 floor). */
export function measureTapServerConfirmed(): number | null {
  return measureBetween(MARK.scanTap, MARK.scanServerConfirmed);
}

// --- JS-thread frame sampler (O1/O2) ---------------------------------------

export type FrameSample = { framesTotal: number; framesOverBudget: number };

// --- Frame-sample sink (O1/O2) ---------------------------------------------
// The JS-thread and UI-thread samples are published + stored SEPARATELY (never
// merged) so the gate can report both threads. This is a bounded record keyed by
// a closed `FrameSampleSource` union — NOT free-form marks, so the MARK vocab
// stays closed (no high-cardinality/free-form telemetry).
export type FrameSampleSource = "js" | "ui";

const frameSamples: Record<FrameSampleSource, FrameSample | null> = { js: null, ui: null };

/** Publish a captured frame sample to the sink under its thread source. */
export function publishFrameSample(source: FrameSampleSource, sample: FrameSample): void {
  frameSamples[source] = sample;
}

/** Read the last published sample for a thread source (null if none yet). */
export function getFrameSample(source: FrameSampleSource): FrameSample | null {
  return frameSamples[source];
}

type FrameSamplerHandle = {
  stop: () => FrameSample;
};

/**
 * Start a JS-thread rAF delta sampler over `budgetMs` (the per-frame budget for
 * the gate device's refresh rate). Counts frames whose inter-frame delta exceeds
 * budget. Call the returned `stop()` at the end of the measured interaction.
 * No-op-safe: if rAF is unavailable, stop() returns a zero sample.
 */
export function startFrameSampler(budgetMs: number): FrameSamplerHandle {
  const raf: typeof requestAnimationFrame | undefined =
    typeof requestAnimationFrame === "function" ? requestAnimationFrame : undefined;
  const caf: typeof cancelAnimationFrame | undefined =
    typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : undefined;

  let framesTotal = 0;
  let framesOverBudget = 0;
  let last = performanceNow();
  let rafId: number | null = null;
  let running = true;

  const tick = () => {
    if (!running || !raf) return;
    const now = performanceNow();
    const delta = now - last;
    last = now;
    framesTotal += 1;
    if (delta > budgetMs) framesOverBudget += 1;
    rafId = raf(tick);
  };

  if (raf) rafId = raf(tick);

  return {
    stop: (): FrameSample => {
      running = false;
      if (rafId != null && caf) caf(rafId);
      return { framesTotal, framesOverBudget };
    },
  };
}

function performanceNow(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}
