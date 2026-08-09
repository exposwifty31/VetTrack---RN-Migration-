/**
 * Home bento reflow rule (G3 Slice 13).
 *
 * Home is the one adapted screen that is NOT master/detail: it has no list to
 * select from, so on a tablet it reflows its existing dashboard cards into two
 * columns instead of running one ~1300pt-wide column of cards.
 *
 * Kept framework-free so the decision is unit-testable without a renderer.
 */

/**
 * Narrowest a bento column may get before two columns stop being an
 * improvement. Below this the cards' own content (the shift hero's stat row,
 * the readiness gauges) starts wrapping, so one full-width column reads better.
 */
export const HOME_BENTO_MIN_COLUMN_WIDTH = 340;

/**
 * How many columns Home's card grid should use.
 *
 * Phones are always 1. A tablet only earns 2 when the window can actually give
 * both columns a legible width — which is what makes this correct under iPad
 * Split View: a 50/50 split on a 12.9" (≈678pt) still reports as a tablet by
 * short side, but falls back to one column here rather than squeezing.
 */
export function resolveHomeColumns(availableWidth: number, isTablet: boolean): 1 | 2 {
  if (!isTablet || !Number.isFinite(availableWidth)) return 1;
  // No gap term: every Home card carries its own `px-[22px]`, so the column
  // gutter is formed by the two cards' facing insets rather than by the row.
  return availableWidth >= HOME_BENTO_MIN_COLUMN_WIDTH * 2 ? 2 : 1;
}
