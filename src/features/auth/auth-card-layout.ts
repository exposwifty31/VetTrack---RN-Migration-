/**
 * Pure layout decision for the sign-in card (two-pane-layout precedent — the
 * one rule that silently breaks the tablet surface is unit-testable without a
 * renderer). The form factor itself comes from `useIsTablet` (Slice-13
 * short-side >= 600 rule); this module only maps it to style.
 */

/**
 * Web parity anchor: the web auth column is `max-w-sm` (384px). The RN card
 * breathes slightly wider for touch-first inputs but stays in the same visual
 * family.
 */
export const AUTH_CARD_MAX_WIDTH = 420;

export type AuthCardLayout =
  | { width: "100%"; alignSelf: "stretch" }
  | { width: "100%"; alignSelf: "center"; maxWidth: number };

export function resolveAuthCardLayout(isTablet: boolean): AuthCardLayout {
  if (!isTablet) return { width: "100%", alignSelf: "stretch" };
  return { width: "100%", alignSelf: "center", maxWidth: AUTH_CARD_MAX_WIDTH };
}
