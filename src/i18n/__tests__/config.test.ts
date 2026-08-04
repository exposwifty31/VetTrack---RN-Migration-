import { __resetLocaleCacheForTests } from "../locale-resolver";

// The storage port hits the MMKV native module, absent under jest — mock the
// safe-storage helpers so resolveInitialLocale() falls through to the Hebrew
// default deterministically.
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

describe("i18n config", () => {
  beforeEach(() => {
    __resetLocaleCacheForTests();
    jest.resetModules();
  });

  it("boots Hebrew by default and resolves Hebrew copy", () => {
    const { i18n } = require("../config");
    expect(i18n.language).toBe("he");
    expect(i18n.t("common.save")).toBe("שמור");
    expect(i18n.t("home.signIn")).toBe("התחברות (Clerk)");
  });

  it("interpolates variables", () => {
    const { i18n } = require("../config");
    expect(i18n.t("home.subtitle", { allowlist: 3, days: 30 })).toContain("3");
    expect(i18n.t("home.subtitle", { allowlist: 3, days: 30 })).toContain("30");
  });

  it("switches to English on changeLanguage", async () => {
    const { i18n } = require("../config");
    await i18n.changeLanguage("en");
    expect(i18n.t("common.save")).toBe("Save");
    await i18n.changeLanguage("he");
  });
});
