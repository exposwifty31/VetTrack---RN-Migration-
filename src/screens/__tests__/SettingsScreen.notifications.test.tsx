/**
 * W3a/B7 — the Notifications section must report a denied OS permission and
 * offer the only repair the OS allows, instead of rendering a dead placeholder.
 *
 * Why this section and NOT a preferences panel: the server does expose
 * `PATCH /api/push/subscribe` with six toggles, but one of them —
 * `alertsEnabled` — gates `sendPushToAll`, which is the transport for
 * `code_blue_broadcast` (server/workers/notification.worker.ts:145 →
 * server/lib/push.ts:467). A plain "alerts" switch here would be a control that
 * silently disables Code Blue alerting, and there is no GET to read the current
 * server value back, so the switch could not even show the truth. That is a
 * clinical decision, not a UI task; it is recorded, not shipped. What is both
 * safe and already built is the OS permission state.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import i18next from "@/i18n/config";
import {
  _resetPushPermissionStatusForTests,
  recordPushPermission,
} from "@/infrastructure/push/push-permission-status";

import { SettingsScreen } from "../SettingsScreen";

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.3.0" } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("@/features/account/LanguageCard", () => ({ LanguageCard: () => null }));
jest.mock("@/features/account/theme-resolver", () => ({
  applyThemeChange: () => ({ persisted: true }),
  resolveInitialTheme: () => "light",
}));

const deniedBody = () => i18next.t("settings.notificationsDeniedBody");
const openSettingsLabel = () => i18next.t("settings.openSystemSettings");
const grantedBody = () => i18next.t("settings.notificationsGranted");

afterEach(() => {
  _resetPushPermissionStatusForTests();
  jest.restoreAllMocks();
});

describe("SettingsScreen — notifications", () => {
  it("warns that emergency alerts cannot arrive when permission is denied", async () => {
    recordPushPermission(false);
    await render(<SettingsScreen />);

    expect(screen.getByText(deniedBody())).toBeTruthy();
    expect(screen.getByText(openSettingsLabel())).toBeTruthy();
  });

  it("routes the repair to OS settings — the only place a denial can be undone", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    recordPushPermission(false);
    await render(<SettingsScreen />);

    fireEvent.press(screen.getByRole("button", { name: openSettingsLabel() }));

    expect(openSettings).toHaveBeenCalled();
  });

  it("says nothing alarming before the OS has been asked", async () => {
    await render(<SettingsScreen />);

    expect(screen.queryByText(deniedBody())).toBeNull();
    expect(screen.queryByText(openSettingsLabel())).toBeNull();
  });

  it("confirms delivery is on when permission is granted", async () => {
    recordPushPermission(true);
    await render(<SettingsScreen />);

    expect(screen.getByText(grantedBody())).toBeTruthy();
    expect(screen.queryByText(openSettingsLabel())).toBeNull();
  });
});
