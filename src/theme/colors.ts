/**
 * Aurora color literals for the handful of RN props that do NOT accept a
 * `className` — `placeholderTextColor`, `ActivityIndicator color`, etc. Every
 * other color goes through a Uniwind token; these mirror the dark-theme tokens
 * in `src/global.css` (keep in sync). Centralized so a palette change updates one
 * place instead of scattered hex literals.
 */
export const AURORA_COLORS = {
  /** --color-foreground */
  foreground: "#F3F1FA",
  /** --color-muted (also the dark placeholder tint) */
  muted: "#A6A0C3",
  /** --color-danger (Code Blue family) */
  danger: "#F87171",
} as const;
