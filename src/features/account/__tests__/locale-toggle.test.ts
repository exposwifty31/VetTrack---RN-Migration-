/**
 * Pure-unit tests for the locale-toggle logic (Slice 12). No full i18next init:
 * `applyLocaleChange` takes the i18n instance by injection, and safe-storage is
 * mocked (the leaf `locale-resolver`/`rtl` modules it touches import the MMKV
 * port, absent under jest). jest-expo boots LTR (I18nManager.isRTL === false),
 * so switching to Hebrew reports a pending reload and English does not.
 */
import { I18nManager } from "react-native";

import { applyLocaleChange, nextLocale } from "../locale-toggle";
import { LOCALE_STORAGE_KEY } from "@/i18n/locale-resolver";

const mockSet = jest.fn((_k: string, _v: string, _kind?: string): boolean => true);
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((): string | null => null),
  safeStorageSetItem: (k: string, v: string, kind?: string) => mockSet(k, v, kind),
  safeStorageRemoveItem: jest.fn((): boolean => true),
}));

const forceSpy = jest.spyOn(I18nManager, "forceRTL");
const allowSpy = jest.spyOn(I18nManager, "allowRTL");

function makeI18n() {
  const changeLanguage = jest.fn(async () => undefined);
  const i18n = { changeLanguage } as unknown as Parameters<typeof applyLocaleChange>[0];
  return { i18n, changeLanguage };
}

beforeEach(() => {
  mockSet.mockClear();
  forceSpy.mockClear();
  allowSpy.mockClear();
});

describe("nextLocale", () => {
  it("swaps he⇄en", () => {
    expect(nextLocale("he")).toBe("en");
    expect(nextLocale("en")).toBe("he");
  });
});

describe("applyLocaleChange", () => {
  it("flips i18next, persists the choice, aligns the RTL flag, and reports no pending reload for English (booted LTR)", async () => {
    const { i18n, changeLanguage } = makeI18n();

    const result = await applyLocaleChange(i18n, "en");

    expect(changeLanguage).toHaveBeenCalledWith("en");
    expect(mockSet).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "en", "local");
    expect(allowSpy).toHaveBeenLastCalledWith(false);
    expect(forceSpy).toHaveBeenLastCalledWith(false);
    expect(result.reloadPending).toBe(false);
  });

  it("forces RTL and reports a pending reload when switching to Hebrew from an LTR boot", async () => {
    const { i18n, changeLanguage } = makeI18n();

    const result = await applyLocaleChange(i18n, "he");

    expect(changeLanguage).toHaveBeenCalledWith("he");
    expect(mockSet).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "he", "local");
    expect(forceSpy).toHaveBeenLastCalledWith(true);
    expect(result.reloadPending).toBe(true);
  });
});
