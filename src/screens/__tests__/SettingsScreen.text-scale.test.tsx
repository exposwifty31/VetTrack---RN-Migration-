/**
 * F5 adoption — the settings surface actually renders CAPPED text nodes.
 *
 * A policy module plus a wrapper that nothing renders proves nothing, so this
 * walks the real Settings tree (Appearance + Language + About) and asserts the
 * ceiling landed on the nodes a user sees. It is the regression guard against
 * someone reverting a single `AppText` back to a raw `Text`.
 *
 * LanguageCard is deliberately NOT mocked here (unlike the notifications suite)
 * — it is part of the settings surface and its own text has to be capped too.
 */
import { render, screen } from "@testing-library/react-native";

import i18next from "@/i18n/config";
import { MAX_FONT_SIZE_MULTIPLIER } from "@/theme/font-scale-policy";

import { SettingsScreen } from "../SettingsScreen";

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.3.0" } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("@/features/account/theme-resolver", () => ({
  applyThemeChange: () => ({ persisted: true }),
  resolveInitialTheme: () => "light",
}));

const capOf = (text: string) => screen.getByText(text).props.maxFontSizeMultiplier;

describe("SettingsScreen — OS Dynamic Type ceiling", () => {
  it("caps the Appearance section heading and its theme options", async () => {
    await render(<SettingsScreen />);

    expect(capOf(i18next.t("settings.appearance"))).toBe(MAX_FONT_SIZE_MULTIPLIER);
    expect(capOf(i18next.t("settings.themeLight"))).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it("caps the Language card, which renders from its own feature module", async () => {
    await render(<SettingsScreen />);

    expect(capOf(i18next.t("account.language"))).toBe(MAX_FONT_SIZE_MULTIPLIER);
    expect(capOf(i18next.t("common.hebrew"))).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it("caps the About section, including the version line", async () => {
    await render(<SettingsScreen />);

    expect(capOf(i18next.t("settings.privacyPolicy"))).toBe(MAX_FONT_SIZE_MULTIPLIER);
    expect(capOf(i18next.t("settings.version", { version: "1.3.0" }))).toBe(
      MAX_FONT_SIZE_MULTIPLIER,
    );
  });
});
