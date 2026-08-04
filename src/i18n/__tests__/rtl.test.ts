import { I18nManager } from "react-native";

import { applyRtlDirection, isRtlLocale, isRtlReloadPending } from "../rtl";

describe("rtl", () => {
  it("maps Hebrew to RTL and English to LTR", () => {
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
  });

  it("applyRtlDirection sets the native flags to the desired direction", () => {
    const force = jest.spyOn(I18nManager, "forceRTL");
    const allow = jest.spyOn(I18nManager, "allowRTL");
    applyRtlDirection("he");
    expect(allow).toHaveBeenCalledWith(true);
    expect(force).toHaveBeenCalledWith(true);
    applyRtlDirection("en");
    expect(force).toHaveBeenLastCalledWith(false);
  });

  it("reports a reload is pending when booted direction differs from the locale", () => {
    // jest-expo default: I18nManager.isRTL === false (LTR).
    expect(isRtlReloadPending("he")).toBe(true); // wants RTL, booted LTR
    expect(isRtlReloadPending("en")).toBe(false); // wants LTR, booted LTR
  });
});
