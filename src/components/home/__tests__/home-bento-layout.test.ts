/**
 * Locks Home's tablet reflow rule — including the Split View case, where the
 * window still measures as a tablet by short side but is too narrow for two
 * legible columns.
 */
import { HOME_BENTO_MIN_COLUMN_WIDTH, resolveHomeColumns } from "../home-bento-layout";

const TWO_COLUMN_FLOOR = HOME_BENTO_MIN_COLUMN_WIDTH * 2;

describe("resolveHomeColumns", () => {
  test("a phone is always one column, however wide the window reports", () => {
    expect(resolveHomeColumns(430, false)).toBe(1);
    expect(resolveHomeColumns(932, false)).toBe(1);
  });

  test("iPad mini portrait (744) already earns two columns", () => {
    expect(resolveHomeColumns(744, true)).toBe(2);
  });

  test("every full-screen iPad width is two columns", () => {
    // 11" portrait / landscape and 12.9" landscape.
    expect(resolveHomeColumns(834, true)).toBe(2);
    expect(resolveHomeColumns(1194, true)).toBe(2);
    expect(resolveHomeColumns(1366, true)).toBe(2);
  });

  test("a 50/50 Split View pane stays one column rather than squeezing", () => {
    // 12.9" landscape halved ≈ 678pt: still a tablet by short side, too narrow here.
    expect(resolveHomeColumns(678, true)).toBe(1);
  });

  test("the threshold is exact", () => {
    expect(resolveHomeColumns(TWO_COLUMN_FLOOR - 1, true)).toBe(1);
    expect(resolveHomeColumns(TWO_COLUMN_FLOOR, true)).toBe(2);
  });

  test("degenerate widths fall back to one column", () => {
    expect(resolveHomeColumns(Number.NaN, true)).toBe(1);
    expect(resolveHomeColumns(Number.POSITIVE_INFINITY, true)).toBe(1);
  });
});
