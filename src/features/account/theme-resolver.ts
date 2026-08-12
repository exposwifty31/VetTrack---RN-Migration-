/**
 * Theme mode resolver — Light default + Dark + System (mirrors the Capacitor
 * web app's three modes). Pure, unit-tested logic that the SettingsScreen toggle
 * and App.tsx boot both drive; the Uniwind side effect (`setTheme`) is injected
 * so this module unit-tests without the native singleton, exactly as
 * `locale-toggle` injects the i18next instance.
 *
 * LIGHT is the product default: a fresh install with no persisted choice
 * resolves to light and PINS it — it must NOT silently follow the OS. Only the
 * explicit "System" mode follows the OS appearance. Persistence goes through the
 * MMKV storage port (fail-loud), same key convention as the locale.
 */
import { safeStorageGetItem, safeStorageSetItem } from "@/lib/safe-storage";

/** The three user-selectable modes. `system` follows the OS appearance. */
export type ThemeMode = "light" | "dark" | "system";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"] as const;

/**
 * Boot default with no persisted choice — LIGHT. Mirrors the web app's default
 * and is deliberately NOT "system": the default must be a fixed light UI, not
 * whatever the device happens to be set to.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "light";

/** Persisted-choice key — same "vettrack-*" convention as the locale. */
export const THEME_STORAGE_KEY = "vettrack-theme";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Cycle order for a single-affordance toggle: light → dark → system → light. */
export function cycleTheme(current: ThemeMode): ThemeMode {
  switch (current) {
    case "light":
      return "dark";
    case "dark":
      return "system";
    case "system":
      return "light";
  }
}

// Memoized for the launch so App.tsx's boot `setTheme` and any later
// `resolveInitialTheme()` observe the same value. Reset only by a full JS
// reload (module re-evaluation) or the test helper below.
let cachedInitialTheme: ThemeMode | null = null;

/**
 * Resolve the theme to boot with: the persisted choice if valid, else LIGHT.
 * The storage read is best-effort at THIS call site — the MMKV port stays
 * fail-loud, so if the native module is not ready during early entry-point
 * evaluation the throw is caught here and we fall back to light (never OS).
 */
export function resolveInitialTheme(): ThemeMode {
  if (cachedInitialTheme) return cachedInitialTheme;
  let resolved: ThemeMode = DEFAULT_THEME_MODE;
  try {
    const stored = safeStorageGetItem(THEME_STORAGE_KEY, "local");
    if (isThemeMode(stored)) resolved = stored;
  } catch {
    resolved = DEFAULT_THEME_MODE;
  }
  cachedInitialTheme = resolved;
  return resolved;
}

/**
 * Persist an explicit theme choice and update the launch cache so a later
 * `resolveInitialTheme()` in the same launch stays consistent. Best-effort
 * (never throws to the caller); the port itself still surfaces failures loudly.
 * Returns whether the durable write SUCCEEDED so the caller can surface an error.
 */
export function persistTheme(mode: ThemeMode): boolean {
  let persisted = false;
  try {
    persisted = safeStorageSetItem(THEME_STORAGE_KEY, mode, "local");
  } catch {
    persisted = false;
  }
  cachedInitialTheme = mode;
  return persisted;
}

export type ThemeChangeResult = Readonly<{
  /** Whether the choice was durably persisted (false → won't survive restart). */
  persisted: boolean;
}>;

/**
 * Apply a theme choice: set it LIVE via the injected `setTheme` (Uniwind
 * applies immediately for this session) and persist it. Unlike the RTL flag —
 * which is a next-launch setting and is gated on a successful persist — the
 * theme is a this-session live change, so it is applied even when the write
 * fails (no cross-launch divergence risk); the caller surfaces the failed
 * persist. Side-effecting but dependency-injected so it unit-tests without
 * Uniwind.
 */
export function applyThemeChange(
  mode: ThemeMode,
  setTheme: (mode: ThemeMode) => void,
): ThemeChangeResult {
  setTheme(mode);
  const persisted = persistTheme(mode);
  return { persisted };
}

/** Test-only: clear the launch cache between suites. */
export function __resetThemeCacheForTests(): void {
  cachedInitialTheme = null;
}
