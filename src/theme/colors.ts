/**
 * Aurora color literals for the handful of RN props that do NOT accept a
 * `className` — `placeholderTextColor`, `ActivityIndicator color`, etc. These
 * mirror the DARK-theme tokens in `src/global.css` (keep in sync). `foreground`
 * and `muted` read acceptably in light mode, but `danger` differs materially
 * between themes and is AA-critical (Code Blue family), so it is a theme-aware
 * FUNCTION (`dangerColor`), never a static literal — a static dark danger
 * renders wrong on a light surface. Centralized so a palette change updates one
 * place instead of scattered hex literals.
 */
export const AURORA_COLORS = {
  /** --color-foreground */
  foreground: "#F3F1FA",
  /** --color-muted (also the dark placeholder tint) */
  muted: "#A6A0C3",
} as const;

/**
 * Theme-aware `--color-danger` for the non-className props (spinners /
 * indicators). Dark #F87171, AA-light #DC2626 (4.83:1 on the light surface).
 * Pass the active Uniwind theme name; anything other than "light" is dark.
 */
export function dangerColor(theme: string): string {
  return theme === "light" ? "#DC2626" : "#F87171";
}
