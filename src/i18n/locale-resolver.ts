import { safeStorageGetItem, safeStorageSetItem } from "@/lib/safe-storage";

/** Supported UI locales. Hebrew is the product default. */
export type Locale = "he" | "en";

export const SUPPORTED_LOCALES: readonly Locale[] = ["he", "en"] as const;

/**
 * Initial locale for a fresh session with no persisted choice — Hebrew.
 * Mirrors vettrack's INITIAL_LOCALE (§19 locked decision 1).
 */
export const INITIAL_LOCALE: Locale = "he";

/**
 * Structural fallback locale for missing keys — English.
 * Mirrors vettrack's DEFAULT_LOCALE (the dictionary-fallback anchor). Do NOT
 * flip this to "he"; use INITIAL_LOCALE for the boot default instead.
 */
export const FALLBACK_LOCALE: Locale = "en";

/** Persisted-choice key — same string vettrack uses ("vettrack-locale"). */
export const LOCALE_STORAGE_KEY = "vettrack-locale";

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === "he" || value === "en";
}

// Memoized for the launch so rtl-bootstrap and the i18next config resolve the
// exact same locale. Reset only by a full JS reload (which re-evaluates modules).
let cachedInitialLocale: Locale | null = null;

/**
 * Resolve the locale to boot with: the persisted choice if valid, else the
 * Hebrew default. The storage read is best-effort AT THIS CALL SITE — the MMKV
 * port stays fail-loud, so if the native module is not ready during early
 * entry-point evaluation the throw is caught here and we fall back to Hebrew.
 * The result is cached so no later caller can observe a different value.
 */
export function resolveInitialLocale(): Locale {
  if (cachedInitialLocale) return cachedInitialLocale;
  let resolved: Locale = INITIAL_LOCALE;
  try {
    const stored = safeStorageGetItem(LOCALE_STORAGE_KEY, "local");
    if (isSupportedLocale(stored)) resolved = stored;
  } catch {
    resolved = INITIAL_LOCALE;
  }
  cachedInitialLocale = resolved;
  return resolved;
}

/**
 * Persist an explicit locale choice and update the launch cache so a subsequent
 * resolveInitialLocale() in the same launch stays consistent. Best-effort write
 * (never throws to the caller); the port itself still surfaces failures loudly.
 * Returns whether the durable write SUCCEEDED — callers use this to avoid moving
 * native state (e.g. the RTL flag) ahead of what actually persisted.
 */
export function persistLocale(locale: Locale): boolean {
  let persisted = false;
  try {
    persisted = safeStorageSetItem(LOCALE_STORAGE_KEY, locale, "local");
  } catch {
    // best-effort — a failed persist must not crash a language toggle
    persisted = false;
  }
  cachedInitialLocale = locale;
  return persisted;
}

/** Test-only: clear the launch cache between suites. */
export function __resetLocaleCacheForTests(): void {
  cachedInitialLocale = null;
}
