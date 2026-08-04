import { I18nManager } from "react-native";

import type { Locale } from "./locale-resolver";

// Only Hebrew is RTL in this app. Kept as a set for future RTL locales.
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["he"]);

export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

/**
 * Align the native layout-direction flags with the locale.
 *
 * IMPORTANT: I18nManager.forceRTL only takes effect after a JS reload when it
 * CHANGES the current direction. It does not flip an already-rendered tree live.
 * Call this as early as possible (rtl-bootstrap, before the first render) so a
 * fresh launch lays out correctly; a change made at runtime (language toggle)
 * needs one reload — see isRtlReloadPending. On iOS/Android the forced flag
 * persists natively, so after that first reload subsequent launches are already
 * correct with no further reload.
 */
export function applyRtlDirection(locale: Locale): void {
  const desired = isRtlLocale(locale);
  I18nManager.allowRTL(desired);
  I18nManager.forceRTL(desired);
}

/**
 * True when the currently-rendered direction (I18nManager.isRTL, the boot-time
 * value) does not match what the given locale requires — i.e. a reload is needed
 * for the direction to actually apply.
 */
export function isRtlReloadPending(locale: Locale): boolean {
  return I18nManager.isRTL !== isRtlLocale(locale);
}
