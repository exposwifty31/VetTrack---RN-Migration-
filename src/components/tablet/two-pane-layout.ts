/**
 * Pure geometry + selection rules behind `TwoPane` (G3 Slice 13).
 *
 * Kept framework-free so the two decisions that can silently break the tablet
 * layout — how wide the master pane is, and what the detail pane shows — are
 * unit-testable without a renderer (the `equipment-row-status` precedent).
 */

/** Never let the master pane collapse below a legible row width. */
export const MASTER_MIN_WIDTH = 260;
/** Default cap — past this a wider master just wastes detail-pane space. */
export const MASTER_MAX_WIDTH = 380;
/** Proportional target before the floor/cap are applied. */
export const MASTER_WIDTH_RATIO = 0.42;

/**
 * Responsive master width: ~42% of the available width, floored at
 * MASTER_MIN_WIDTH and capped at `maxWidth`, and never wider than the frame
 * itself (a master that ate the whole row would hide the detail pane).
 */
export function resolveMasterWidth(
  availableWidth: number,
  maxWidth: number = MASTER_MAX_WIDTH,
): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return MASTER_MIN_WIDTH;
  const cap = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : MASTER_MAX_WIDTH;
  const proportional = availableWidth * MASTER_WIDTH_RATIO;
  const bounded = Math.max(MASTER_MIN_WIDTH, Math.min(proportional, cap));
  return Math.min(bounded, availableWidth);
}

/**
 * Detail-pane selection rule.
 *
 * The selected id is held by the master screen, but the master's data set moves
 * underneath it (a new search, a realtime invalidation, a day change). When the
 * selection is no longer in the list the detail pane must fall back to the
 * placeholder rather than keep rendering a row the user can no longer see — so
 * selection is DERIVED from the current data on every render, never trusted from
 * state alone.
 *
 * There is deliberately no auto-select-first: opening a tablet screen must not
 * fire a detail fetch the user never asked for.
 */
export function resolveSelectedItem<T extends { readonly id: string }>(
  items: readonly T[],
  selectedId: string | null | undefined,
): T | null {
  if (!selectedId) return null;
  return items.find((item) => item.id === selectedId) ?? null;
}
