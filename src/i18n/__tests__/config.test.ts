import { __resetLocaleCacheForTests } from "../locale-resolver";

// The storage port hits the MMKV native module, absent under jest — mock the
// safe-storage helpers so resolveInitialLocale() reads a controllable value.
// safeStorageGetItem delegates to a stable outer mock (prefixed `mock*` so
// jest's hoist allows it) that survives jest.resetModules() and lets each test
// dictate the persisted locale before importing ../config.
const mockSafeStorageGetItem = jest.fn(
  (_key: string, _kind?: string): string | null => null,
);

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string, kind?: string) => mockSafeStorageGetItem(key, kind),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

describe("i18n config", () => {
  beforeEach(() => {
    __resetLocaleCacheForTests();
    jest.resetModules();
    mockSafeStorageGetItem.mockReset();
    // Default: no persisted choice → Hebrew.
    mockSafeStorageGetItem.mockReturnValue(null);
  });

  it("boots Hebrew by default and resolves Hebrew copy", () => {
    const { i18n } = require("../config");
    expect(i18n.isInitialized).toBe(true); // initAsync:false → sync init, no flash
    expect(i18n.language).toBe("he");
    expect(i18n.t("common.save")).toBe("שמור");
    expect(i18n.t("home.signIn")).toBe("התחברות (Clerk)");
  });

  it("honors a persisted English choice on init", () => {
    mockSafeStorageGetItem.mockReturnValue("en");
    const { i18n } = require("../config");
    expect(i18n.language).toBe("en");
    expect(i18n.t("common.save")).toBe("Save");
  });

  it("interpolates variables", () => {
    const { i18n } = require("../config");
    expect(i18n.t("home.subtitle", { allowlist: 3, days: 30 })).toContain("3");
    expect(i18n.t("home.subtitle", { allowlist: 3, days: 30 })).toContain("30");
  });

  it("switches to English and back to Hebrew on changeLanguage", async () => {
    const { i18n } = require("../config");
    await i18n.changeLanguage("en");
    expect(i18n.t("common.save")).toBe("Save");
    // Reverse switch: Hebrew copy resolves again after toggling back.
    await i18n.changeLanguage("he");
    expect(i18n.t("common.save")).toBe("שמור");
  });
});
