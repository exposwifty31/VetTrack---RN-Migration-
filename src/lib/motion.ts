/**
 * G2.5 Aurora motion language — "נוזלי" (liquid).
 * Source of truth: docs/design/aurora-home/direction-1c-aurora.md §Motion +
 * README.md §Interactions & Behavior. These are the ONLY sanctioned presets —
 * do not invent per-screen timings.
 *
 * When to animate (binding rules from the spec):
 *   - Animate `transform` and `opacity` ONLY (90fps budget — 0 dropped frames).
 *   - Press state: scale .96 with spring-back on release — the signature feel
 *     (see `PressableScale`).
 *   - Status change: 200ms color crossfade (DURATION.fast).
 *   - Bottom sheets: spring rise, ~380ms envelope (DURATION.sheet); backdrop
 *     dim 200ms.
 *   - One celebratory moment only: a single 400ms glow sweep on successful scan.
 *
 * NEVER animate:
 *   - Code Blue / emergency surfaces (zero motion, zero glass).
 *   - List rows (FlashList recycling must stay cheap).
 *   - Blur values (re-rasterizes every frame).
 *   - The aurora background glow (painted once, static forever).
 */

/** Duration presets in ms. */
export const DURATION = {
  fast: 200,
  base: 280,
  sheet: 380,
} as const;

/**
 * The one spring config (Reanimated `withSpring`): stiffness 260 / damping 26 —
 * a soft settle with ~2% overshoot.
 */
export const SPRING = {
  stiffness: 260,
  damping: 26,
} as const;

/** Press-state target scale — the signature Aurora press feel. */
export const PRESS_SCALE = 0.96;
