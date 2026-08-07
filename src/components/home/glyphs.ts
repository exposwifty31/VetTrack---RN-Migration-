/**
 * Direction-aware forward glyphs (README.md §3: "← arrow (RTL forward)").
 * Layout direction is fixed at boot (rtl-bootstrap), so module-level constants
 * are safe — a direction change always goes through a JS reload.
 */
import { I18nManager } from "react-native";

export const FORWARD_ARROW = I18nManager.isRTL ? "←" : "→";
export const FORWARD_CHEVRON = I18nManager.isRTL ? "‹" : "›";
