/**
 * Aurora motion presets — the spec'd constants are a contract
 * (direction-1c-aurora.md §Motion): fast 200 / base 280 / sheet 380,
 * spring stiffness 260 / damping 26, press scale .96.
 */
import { DURATION, PRESS_SCALE, SPRING } from "../motion";

describe("Aurora motion presets", () => {
  it("exposes the spec'd duration presets", () => {
    expect(DURATION).toEqual({ fast: 200, base: 280, sheet: 380 });
  });

  it("exposes the single sanctioned spring config", () => {
    expect(SPRING).toEqual({ stiffness: 260, damping: 26 });
  });

  it("press scale is the signature .96", () => {
    expect(PRESS_SCALE).toBe(0.96);
  });

  it("durations are ordered fast < base < sheet", () => {
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.sheet);
  });
});
