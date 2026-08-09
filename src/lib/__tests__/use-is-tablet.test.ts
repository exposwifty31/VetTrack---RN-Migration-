/**
 * Locks the Slice-13 form-factor threshold. The rule is short-side based, so
 * the two properties that matter are (a) the exact boundary and (b) that the
 * answer never changes on rotation.
 */
import { isTabletSize, TABLET_MIN_SHORT_SIDE } from "../use-is-tablet";

describe("isTabletSize", () => {
  test("the threshold is the Android sw600dp constant", () => {
    expect(TABLET_MIN_SHORT_SIDE).toBe(600);
  });

  test("599 short side is a phone, 600 is a tablet (exact boundary)", () => {
    expect(isTabletSize(599, 2000)).toBe(false);
    expect(isTabletSize(600, 2000)).toBe(true);
  });

  test("iPad mini is a tablet in BOTH orientations (rotation stability)", () => {
    expect(isTabletSize(744, 1133)).toBe(true);
    expect(isTabletSize(1133, 744)).toBe(true);
  });

  test("iPhone 16 Pro Max is a phone in BOTH orientations", () => {
    expect(isTabletSize(430, 932)).toBe(false);
    expect(isTabletSize(932, 430)).toBe(false);
  });

  test("iPad Pro 12.9 is a tablet in both orientations", () => {
    expect(isTabletSize(1024, 1366)).toBe(true);
    expect(isTabletSize(1366, 1024)).toBe(true);
  });

  test("a narrow iPad Split View window degrades to the phone layout", () => {
    // 1/3 split of an 11" iPad in landscape — window width, not screen width.
    expect(isTabletSize(507, 1133)).toBe(false);
    // A 50/50 split still clears the bar, so it keeps the two-pane frame.
    expect(isTabletSize(658, 1024)).toBe(true);
  });

  test("any non-finite dimension falls back to the phone layout", () => {
    expect(isTabletSize(Number.NaN, 1024)).toBe(false);
    expect(isTabletSize(1024, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isTabletSize(Number.POSITIVE_INFINITY, Number.NaN)).toBe(false);
  });
});
