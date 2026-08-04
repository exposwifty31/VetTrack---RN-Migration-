import { DevSettings } from "react-native";

import { safeStorageGetItem, safeStorageRemoveItem, safeStorageSetItem } from "@/lib/safe-storage";

import { resolveInitialLocale } from "./locale-resolver";
import { applyRtlDirection, isRtlReloadPending } from "./rtl";

// Persisted one-shot guard. I18nManager.forceRTL only takes effect after a JS
// reload, so a fresh RTL launch must reload ONCE before the first render. This
// marker makes that reload loop-safe: if a reload somehow fails to flip
// I18nManager.isRTL (a known dev JS-reload edge case) we render once in the
// wrong direction rather than reloading forever.
const RTL_RELOAD_GUARD_KEY = "vettrack-rtl-reload-attempted";

function clearReloadGuard(): void {
  try {
    safeStorageRemoveItem(RTL_RELOAD_GUARD_KEY, "local");
  } catch {
    // best-effort — a failed clear must not crash boot
  }
}

/**
 * Trigger the actual JS reload. In dev / Expo Go, DevSettings.reload() restarts
 * the bundle immediately. In a production build a JS-level reload requires
 * expo-updates (Updates.reloadAsync()) — not a dependency of this slice — but the
 * forced RTL flag persists natively, so the next cold launch is already correct.
 * Wire Updates.reloadAsync() here if/when expo-updates is added.
 */
function triggerReload(): void {
  if (__DEV__ && typeof DevSettings?.reload === "function") {
    DevSettings.reload();
  }
}

/**
 * Align native layout direction with the boot locale and, when the requested
 * direction differs from the already-rendered one, reload BEFORE the root
 * component registers so the first painted frame is laid out correctly.
 */
function bootstrapRtl(): void {
  const locale = resolveInitialLocale();
  applyRtlDirection(locale);

  if (!isRtlReloadPending(locale)) {
    // Direction already matches (fresh LTR launch, or a prior reload landed the
    // correct direction) — nothing to reload; drop any stale guard.
    clearReloadGuard();
    return;
  }

  // A reload is needed to apply the direction. Guard against re-reloading if a
  // previous attempt did not flip I18nManager.isRTL.
  let alreadyAttempted = false;
  try {
    alreadyAttempted = safeStorageGetItem(RTL_RELOAD_GUARD_KEY, "local") === "1";
  } catch {
    alreadyAttempted = false;
  }
  if (alreadyAttempted) return;

  try {
    safeStorageSetItem(RTL_RELOAD_GUARD_KEY, "1", "local");
  } catch {
    // best-effort — if we cannot persist the guard, still avoid an obvious loop
    // by only reloading in dev where DevSettings is available.
  }
  triggerReload();
}

// Run at module load — imported ahead of ./App in index.ts so the direction is
// set (and any needed reload fired) before the first render. Shares the memoized
// initial-locale value with the i18next config, so direction and active language
// can never disagree at boot.
bootstrapRtl();
