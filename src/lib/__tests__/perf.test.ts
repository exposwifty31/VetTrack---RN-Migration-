/**
 * G2 measurement harness contracts (docs/g2-preregistration.md §6):
 * raw delta retention, p95, segment concatenation in the sink, and the
 * fail-loud budget getter. jest env has no rAF → startFrameSampler's zero
 * sample path is also covered.
 */
import {
  computeP95,
  concatFrameSamples,
  getFrameBudgetMs,
  getFrameSample,
  publishFrameSample,
  resetFrameSamples,
  startFrameSampler,
} from "@/lib/instrumentation/perf";

const ORIGINAL_BUDGET = process.env.EXPO_PUBLIC_FRAME_BUDGET_MS;

afterEach(() => {
  resetFrameSamples();
  if (ORIGINAL_BUDGET === undefined) {
    delete process.env.EXPO_PUBLIC_FRAME_BUDGET_MS;
  } else {
    process.env.EXPO_PUBLIC_FRAME_BUDGET_MS = ORIGINAL_BUDGET;
  }
});

describe("computeP95", () => {
  test("returns null on an empty array", () => {
    expect(computeP95([])).toBeNull();
  });

  test("nearest-rank p95 over 100 deltas picks the 95th sorted value", () => {
    // 1..100 shuffled — p95 (nearest-rank) = 95.
    const deltas = Array.from({ length: 100 }, (_, i) => i + 1).reverse();
    expect(computeP95(deltas)).toBe(95);
  });

  test("single-element array returns that element", () => {
    expect(computeP95([11.2])).toBe(11.2);
  });
});

describe("frame-sample sink", () => {
  test("segments of the same source CONCATENATE within a run", () => {
    publishFrameSample("js", { framesTotal: 2, framesOverBudget: 1, deltasMs: [10, 20] });
    publishFrameSample("js", { framesTotal: 1, framesOverBudget: 0, deltasMs: [5] });
    expect(getFrameSample("js")).toEqual({
      framesTotal: 3,
      framesOverBudget: 1,
      deltasMs: [10, 20, 5],
    });
  });

  test("js and ui sources never merge", () => {
    publishFrameSample("js", { framesTotal: 1, framesOverBudget: 0, deltasMs: [8] });
    publishFrameSample("ui", { framesTotal: 1, framesOverBudget: 1, deltasMs: [30] });
    expect(getFrameSample("js")?.deltasMs).toEqual([8]);
    expect(getFrameSample("ui")?.deltasMs).toEqual([30]);
  });

  test("resetFrameSamples starts the next run empty", () => {
    publishFrameSample("ui", { framesTotal: 1, framesOverBudget: 0, deltasMs: [9] });
    resetFrameSamples();
    expect(getFrameSample("js")).toBeNull();
    expect(getFrameSample("ui")).toBeNull();
  });
});

describe("concatFrameSamples", () => {
  test("sums counters and preserves delta order", () => {
    const merged = concatFrameSamples(
      { framesTotal: 2, framesOverBudget: 2, deltasMs: [15, 18] },
      { framesTotal: 2, framesOverBudget: 0, deltasMs: [9, 10] },
    );
    expect(merged).toEqual({
      framesTotal: 4,
      framesOverBudget: 2,
      deltasMs: [15, 18, 9, 10],
    });
  });
});

describe("getFrameBudgetMs (fail-loud, never guess 60 Hz)", () => {
  test("returns null when unset", () => {
    delete process.env.EXPO_PUBLIC_FRAME_BUDGET_MS;
    expect(getFrameBudgetMs()).toBeNull();
  });

  test("parses the baked budget", () => {
    process.env.EXPO_PUBLIC_FRAME_BUDGET_MS = "11.11";
    expect(getFrameBudgetMs()).toBe(11.11);
  });

  test("rejects non-positive and non-numeric values", () => {
    process.env.EXPO_PUBLIC_FRAME_BUDGET_MS = "0";
    expect(getFrameBudgetMs()).toBeNull();
    process.env.EXPO_PUBLIC_FRAME_BUDGET_MS = "abc";
    expect(getFrameBudgetMs()).toBeNull();
  });
});

describe("startFrameSampler without rAF (jest env)", () => {
  test("stop() returns a zero sample with an empty delta array", () => {
    const handle = startFrameSampler(11.11);
    expect(handle.stop()).toEqual({ framesTotal: 0, framesOverBudget: 0, deltasMs: [] });
  });
});
