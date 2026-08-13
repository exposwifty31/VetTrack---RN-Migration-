/**
 * Pure-unit tests for the theme-resolver (Light default + Dark + System),
 * mirroring the locale-resolver/locale-toggle split: the MMKV port is mocked
 * (absent under jest), `setTheme` is injected into `applyThemeChange`, and the
 * launch cache is reset between cases. LIGHT is the product default — a fresh
 * install with no persisted choice must resolve to light, never follow the OS.
 */
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  applyThemeChange,
  cycleTheme,
  isThemeMode,
  resolveInitialTheme,
  __resetThemeCacheForTests,
  type ThemeMode,
} from "../theme-resolver";

const mockGet = jest.fn((_k: string, _kind?: string): string | null => null);
const mockSet = jest.fn((_k: string, _v: string, _kind?: string): boolean => true);
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (k: string, kind?: string) => mockGet(k, kind),
  safeStorageSetItem: (k: string, v: string, kind?: string) => mockSet(k, v, kind),
  safeStorageRemoveItem: jest.fn((): boolean => true),
}));

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue(null);
  mockSet.mockReset();
  mockSet.mockReturnValue(true);
  __resetThemeCacheForTests();
});

describe("DEFAULT_THEME_MODE", () => {
  it("is light — the product default, not System/OS-follow", () => {
    expect(DEFAULT_THEME_MODE).toBe("light");
  });
});

describe("isThemeMode", () => {
  it("accepts the three modes and rejects anything else", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("automatic")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
    expect(isThemeMode("")).toBe(false);
  });
});

describe("cycleTheme", () => {
  it("cycles light → dark → system → light", () => {
    expect(cycleTheme("light")).toBe("dark");
    expect(cycleTheme("dark")).toBe("system");
    expect(cycleTheme("system")).toBe("light");
  });
});

describe("resolveInitialTheme", () => {
  it("defaults to light when nothing is persisted", () => {
    const resolved = resolveInitialTheme();
    expect(resolved).toBe("light");
    expect(mockGet).toHaveBeenCalledWith(THEME_STORAGE_KEY, "local");
  });

  it("returns the persisted mode when it is a valid ThemeMode", () => {
    mockGet.mockReturnValue("dark");
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("returns system when system is persisted", () => {
    mockGet.mockReturnValue("system");
    expect(resolveInitialTheme()).toBe("system");
  });

  it("ignores an invalid persisted value and falls back to light", () => {
    mockGet.mockReturnValue("banana");
    expect(resolveInitialTheme()).toBe("light");
  });

  it("falls back to light (never throws) when the storage read throws", () => {
    mockGet.mockImplementation(() => {
      throw new Error("MMKV not ready");
    });
    expect(resolveInitialTheme()).toBe("light");
  });

  it("caches the first resolution for the launch (later reads can't change it)", () => {
    mockGet.mockReturnValue("dark");
    expect(resolveInitialTheme()).toBe("dark");
    mockGet.mockReturnValue("light");
    // Cached — a later storage change does not move the launch value.
    expect(resolveInitialTheme()).toBe("dark");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("applyThemeChange", () => {
  it("applies the theme live and persists it, reporting persisted=true", () => {
    const setTheme = jest.fn<void, [ThemeMode]>();

    const result = applyThemeChange("dark", setTheme);

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(mockSet).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark", "local");
    expect(result.persisted).toBe(true);
  });

  it("still applies live but reports persisted=false when the write fails", () => {
    mockSet.mockReturnValue(false);
    const setTheme = jest.fn<void, [ThemeMode]>();

    const result = applyThemeChange("system", setTheme);

    // Theme is a live, this-session setting (unlike the RTL next-launch flag),
    // so it is applied even on a failed persist; the caller surfaces the error.
    expect(setTheme).toHaveBeenCalledWith("system");
    expect(result.persisted).toBe(false);
  });

  it("keeps the launch cache consistent with an applied choice", () => {
    const setTheme = jest.fn<void, [ThemeMode]>();
    applyThemeChange("system", setTheme);
    // A resolve after an apply in the same launch reflects the applied mode.
    expect(resolveInitialTheme()).toBe("system");
  });
});
