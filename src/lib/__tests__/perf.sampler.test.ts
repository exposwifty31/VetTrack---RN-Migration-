/**
 * Controlled-rAF regression for the JS frame sampler: the sampler-start →
 * first-callback interval is NOT an inter-frame delta and must be excluded
 * (CodeRabbit PR #17). Uses a manual rAF queue + a mocked monotonic clock.
 */
import { startFrameSampler } from "@/lib/instrumentation/perf";

let mockNow = 0;

jest.mock("react-native-performance", () => ({
  __esModule: true,
  default: {
    now: () => mockNow,
    mark: jest.fn(),
    measure: jest.fn(() => ({ duration: 0 })),
    getEntriesByType: jest.fn(() => []),
    getEntriesByName: jest.fn(() => []),
  },
}));

type RafCallback = (time: number) => void;
let rafQueue: RafCallback[] = [];

const globalAny = globalThis as Record<string, unknown>;
let originalRaf: unknown;
let originalCaf: unknown;

beforeEach(() => {
  mockNow = 0;
  rafQueue = [];
  originalRaf = globalAny.requestAnimationFrame;
  originalCaf = globalAny.cancelAnimationFrame;
  globalAny.requestAnimationFrame = (cb: RafCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globalAny.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  globalAny.requestAnimationFrame = originalRaf;
  globalAny.cancelAnimationFrame = originalCaf;
});

/** Advance the clock and fire every queued rAF callback exactly once. */
function flushFrame(advanceMs: number): void {
  mockNow += advanceMs;
  const callbacks = rafQueue;
  rafQueue = [];
  for (const cb of callbacks) cb(mockNow);
}

test("first rAF callback is excluded; subsequent deltas and budget counts are exact", () => {
  const handle = startFrameSampler(11.11);
  flushFrame(50); // sampler-start → first callback: must NOT be recorded
  flushFrame(10); // real delta, under budget
  flushFrame(20); // real delta, over budget
  const sample = handle.stop();
  expect(sample.deltasMs).toEqual([10, 20]);
  expect(sample.framesTotal).toBe(2);
  expect(sample.framesOverBudget).toBe(1);
});

test("stopping after only the first callback yields an empty sample", () => {
  const handle = startFrameSampler(11.11);
  flushFrame(300); // long start-up gap — still not a frame
  expect(handle.stop()).toEqual({ framesTotal: 0, framesOverBudget: 0, deltasMs: [] });
});
