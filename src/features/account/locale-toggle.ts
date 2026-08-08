/**
 * Locale-toggle logic (G3 Slice 12) — client-local only. There is NO server
 * locale write path (G3-PLAN seam §6.2: `GET /api/users/me` reads
 * `preferredLocale`, nothing writes it), so a language change never touches the
 * network: it flips i18next live, persists the choice to MMKV via the existing
 * `persistLocale` ("vettrack-locale"), and aligns the native RTL flag.
 *
 * CRITICAL RTL semantics (see `src/i18n/rtl.ts` + `rtl-bootstrap.ts`):
 * `I18nManager.forceRTL` only takes effect after a JS RELOAD when it CHANGES the
 * current direction — it does NOT flip an already-rendered tree live. So a
 * he⇄en toggle flips COPY immediately (react-i18next re-render) but the layout
 * DIRECTION only applies on the next launch. We persist the choice + force the
 * flag so the next cold launch is correct, and surface an honest "restart to
 * apply" state via `isRtlReloadPending` — we never fake a live direction flip.
 * This mirrors the established I18nDebugScreen pattern.
 */
import type { i18n as I18nInstance } from "i18next";

// Import from the leaf modules (not the `@/i18n` barrel) so this stays free of
// the barrel's `./config` self-initialization side effect.
import { persistLocale, type Locale } from "@/i18n/locale-resolver";
import { applyRtlDirection, isRtlReloadPending } from "@/i18n/rtl";

/** The other supported locale — pure he⇄en swap. */
export function nextLocale(current: Locale): Locale {
  return current === "he" ? "en" : "he";
}

export type LocaleChangeResult = Readonly<{
  /** True when the layout DIRECTION still needs a reload/restart to apply. */
  reloadPending: boolean;
}>;

/**
 * Apply a locale choice: flip i18next language (copy re-renders live), persist
 * the choice, and align the native RTL flag. Returns whether a JS reload/restart
 * is still needed for the layout DIRECTION to actually apply. Side-effecting but
 * dependency-injected (`i18n` passed in) so it unit-tests without full i18next
 * init.
 */
export async function applyLocaleChange(
  i18n: Pick<I18nInstance, "changeLanguage">,
  locale: Locale,
): Promise<LocaleChangeResult> {
  await i18n.changeLanguage(locale);
  persistLocale(locale);
  applyRtlDirection(locale);
  return { reloadPending: isRtlReloadPending(locale) };
}
