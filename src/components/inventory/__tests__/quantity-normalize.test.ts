import { normalizeStepperRange } from "../quantity-normalize";

describe("normalizeStepperRange", () => {
  it("passes through an in-range value untouched", () => {
    expect(normalizeStepperRange(3, 10)).toEqual({ value: 3, upperBound: 10 });
  });

  it("keeps the endpoints of the range", () => {
    expect(normalizeStepperRange(0, 10)).toEqual({ value: 0, upperBound: 10 });
    expect(normalizeStepperRange(10, 10)).toEqual({ value: 10, upperBound: 10 });
  });

  it("clamps a value above max down to max", () => {
    expect(normalizeStepperRange(50, 10)).toEqual({ value: 10, upperBound: 10 });
  });

  it("clamps a negative value up to 0", () => {
    expect(normalizeStepperRange(-5, 10)).toEqual({ value: 0, upperBound: 10 });
  });

  it("treats a negative max as an empty range (upperBound 0)", () => {
    expect(normalizeStepperRange(4, -3)).toEqual({ value: 0, upperBound: 0 });
  });

  it("collapses NaN value to 0", () => {
    expect(normalizeStepperRange(Number.NaN, 10)).toEqual({ value: 0, upperBound: 10 });
  });

  it("collapses NaN max to an empty range", () => {
    expect(normalizeStepperRange(4, Number.NaN)).toEqual({ value: 0, upperBound: 0 });
  });

  it("collapses non-finite inputs (Infinity) to the safe floor instead of emitting them", () => {
    // A non-finite value is not a meaningful count — collapse to 0 rather than
    // emit Infinity; a non-finite max yields an empty range.
    expect(normalizeStepperRange(Number.POSITIVE_INFINITY, 10)).toEqual({
      value: 0,
      upperBound: 10,
    });
    expect(normalizeStepperRange(5, Number.POSITIVE_INFINITY)).toEqual({
      value: 0,
      upperBound: 0,
    });
  });

  it("truncates fractional input to integers", () => {
    expect(normalizeStepperRange(3.9, 10.4)).toEqual({ value: 3, upperBound: 10 });
  });

  it("never lets value exceed a truncated upperBound", () => {
    const { value, upperBound } = normalizeStepperRange(9.9, 8.9);
    expect(upperBound).toBe(8);
    expect(value).toBe(8);
  });
});
