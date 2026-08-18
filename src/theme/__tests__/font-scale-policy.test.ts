/**
 * F5 — the OS Dynamic Type policy, as a contract rather than a magic number.
 *
 * React Native honours the OS text-size setting on every `<Text>` by default
 * (`allowFontScaling` defaults to true) with NO ceiling, and the repo shipped
 * with zero `maxFontSizeMultiplier` anywhere. Both directions of that are an
 * accessibility failure, so both are pinned here:
 *
 *  - too LOW a cap (or `allowFontScaling: false`) fails users who need large
 *    text, and would break WCAG 2.1 SC 1.4.4 (Resize Text, AA) which requires
 *    200% without loss of content or functionality;
 *  - NO cap lets the iOS accessibility sizes (AX1–AX5, which run well past 2x)
 *    grow a Code Blue action until it wraps out of the viewport — a total loss
 *    of functionality on the emergency path, which is the worse outcome.
 *
 * The band below is the trade: at least 200% (the normative bar), and short of
 * the iOS accessibility tail (the reason a ceiling exists at all).
 */
import { FONT_SCALE_POLICY, MAX_FONT_SIZE_MULTIPLIER } from "../font-scale-policy";

describe("MAX_FONT_SIZE_MULTIPLIER", () => {
  it("meets the WCAG 2.1 SC 1.4.4 200% resize bar", () => {
    expect(MAX_FONT_SIZE_MULTIPLIER).toBeGreaterThanOrEqual(2);
  });

  it("stays short of the iOS accessibility tail — an uncapped AX size is what pushes an emergency action off-screen", () => {
    expect(Number.isFinite(MAX_FONT_SIZE_MULTIPLIER)).toBe(true);
    expect(MAX_FONT_SIZE_MULTIPLIER).toBeLessThan(3);
  });
});

describe("FONT_SCALE_POLICY", () => {
  it("never opts out of OS Dynamic Type — the cap is a ceiling, not an off switch", () => {
    expect(FONT_SCALE_POLICY.allowFontScaling).toBe(true);
  });

  it("carries the capped multiplier so Text and TextInput share one source", () => {
    expect(FONT_SCALE_POLICY.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });
});
