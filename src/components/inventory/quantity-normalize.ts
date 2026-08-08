/**
 * Pure normalization for the LTR quantity stepper (G3 Slice 10). The stepper
 * advertises a clamped range but only ever emits on a button press, so a caller
 * that feeds an out-of-range `value` (NaN, negative, fractional, or `value>max`)
 * could otherwise render an invalid quantity and emit another out-of-range one.
 * This collapses any incoming pair to a safe integer window: `upperBound >= 0`
 * and `value ∈ [0, upperBound]`. Extracted so the boundary rules are unit-tested
 * in isolation (mirrors the dispense-derive doctrine).
 */
export type StepperRange = Readonly<{
  /** Clamped display value, always an integer in `[0, upperBound]`. */
  value: number;
  /** Non-negative integer upper bound. */
  upperBound: number;
}>;

/** Coerce to a safe non-negative integer; non-finite input collapses to 0. */
function toSafeCount(input: number): number {
  if (!Number.isFinite(input)) return 0;
  return Math.max(0, Math.trunc(input));
}

/** Normalize `(value, max)` to a valid stepper window. Never throws. */
export function normalizeStepperRange(value: number, max: number): StepperRange {
  const upperBound = toSafeCount(max);
  const clampedValue = Math.min(upperBound, toSafeCount(value));
  return { value: clampedValue, upperBound };
}
