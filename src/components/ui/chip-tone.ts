/**
 * Pure tone → utility-class mapping for `Chip` — its own module (the
 * equipment-row-status pattern) so tests import it without the component tree.
 *
 * AA grounding: status text tokens pass AA on opaque surfaces in both themes
 * (spec AA table via the EquipmentRow precedent); `danger` uses the tokens'
 * documented badge fill `--color-danger-solid` + white content (4.83:1 dark /
 * 6.47:1 light per global.css) — the danger family is never glassed or tinted.
 */
export type ChipTone = "success" | "warning" | "danger" | "info" | "stale" | "neutral";

export type ChipToneClasses = Readonly<{ container: string; text: string }>;

const TONE_CLASSES: Record<ChipTone, ChipToneClasses> = {
  success: { container: "bg-surface-raised border border-border", text: "text-success" },
  warning: { container: "bg-surface-raised border border-border", text: "text-warning" },
  danger: { container: "bg-danger-solid", text: "text-white" },
  info: { container: "bg-surface-raised border border-border", text: "text-info" },
  stale: { container: "bg-surface-raised border border-border", text: "text-stale" },
  neutral: { container: "bg-surface-raised border border-border", text: "text-muted" },
};

export function chipToneClasses(tone: ChipTone): ChipToneClasses {
  return TONE_CLASSES[tone];
}
