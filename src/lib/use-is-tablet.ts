/**
 * Tablet form-factor predicate — G3 Slice 13 (Tablet iOS / iPad).
 *
 * The bucket is decided by the SHORT side of the window, never by width alone:
 *
 *   - Rotation-stable. A width-only rule flips class on every rotation (an iPad
 *     mini is 744×1133 portrait, 1133×744 landscape) and would remount the whole
 *     layout mid-gesture.
 *   - Includes every iPad in BOTH orientations (short side 744…1024 ≥ 600).
 *   - Excludes every phone (iPhone 16 Pro Max short side ≈ 430; the widest
 *     Android phones stay well under 600).
 *   - Matches Android's `sw600dp` smallest-width qualifier, so the same constant
 *     carries over when the Android tablet target lands.
 *   - Degrades correctly under iPad Split View / Slide Over: `useWindowDimensions`
 *     reports the app's WINDOW, not the screen, so a narrow split pane
 *     (e.g. 507×1133) correctly renders the phone layout instead of squeezing a
 *     two-pane frame into a third of the screen.
 *
 * This deliberately deviates from the Capacitor precedent (`width >= 768 &&
 * height >= 500`), which buckets iPad mini portrait (744×1133) as a phone and
 * changes its answer on rotation.
 */
import { useWindowDimensions } from "react-native";

/** Smallest short-side (in dp/pt) that counts as a tablet — Android `sw600dp`. */
export const TABLET_MIN_SHORT_SIDE = 600;

/** Pure, orientation-independent form-factor test. Exported for unit tests. */
export function isTabletSize(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return Math.min(width, height) >= TABLET_MIN_SHORT_SIDE;
}

/**
 * Reactive form-factor hook. `useWindowDimensions` already re-renders on
 * rotation and on Split View resize, so no listener/state of our own is needed.
 */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return isTabletSize(width, height);
}
