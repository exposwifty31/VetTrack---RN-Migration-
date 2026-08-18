/**
 * W-AUTH PR-B: branded sign-in screen — web signin.tsx parity behaviors. The
 * screen consumes the SignInFlowPort ADAPTER (mocked here, per PR #75's
 * port-adapter rule); the Clerk mechanism itself is pinned in the adapter's
 * own suite.
 *
 *   - branding header (welcome-back + subtitle) and the Israeli phone hint
 *   - SSO buttons drive the port with the right strategy; a dismissed flow
 *     (user cancelled the browser) is SILENT — never error UI
 *   - submit disabled while the v4 resource is fetching
 *   - field-error flags from the port render LOCALIZED copy only
 *   - role chips carry the picked role into the requested-role store
 *   - tablet renders the centered capped card (Slice-13 short-side rule)
 *   - the clerk-captcha bot-protection mount point exists (SSO can sign up)
 *   - !isLoaded gates the form behind a spinner (ClerkLoading analog)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import i18next from "@/i18n/config";
import type { SignInFlowPort } from "@/core/ports/sign-in-flow.port";

import { AUTH_CARD_MAX_WIDTH } from "@/features/auth/auth-card-layout";
import { readCarriedRole, writeCarriedRole } from "@/features/auth/requested-role-store";
import type { RootStackScreenProps } from "../../navigation/types";
import { ClerkSignInForm } from "../SignInScreen";

const mockSubmitPassword = jest.fn();
const mockStartSso = jest.fn();

const mockFlow: {
  ready: boolean;
  isSignedIn: boolean;
  isLoaded: boolean;
  fetchStatus: "idle" | "fetching";
  fieldErrors: { identifier: boolean; password: boolean };
  submitPassword: jest.Mock;
  startSso: jest.Mock;
} = {
  ready: true,
  isSignedIn: false,
  isLoaded: true,
  fetchStatus: "idle",
  fieldErrors: { identifier: false, password: false },
  submitPassword: mockSubmitPassword,
  startSso: mockStartSso,
};

jest.mock("@/infrastructure/auth/useSignInFlow", () => ({
  useSignInFlow: (): SignInFlowPort => mockFlow,
}));

jest.mock("@/lib/auth-fetch", () => ({
  resolveToken: jest.fn(async () => null),
  isValidJwt: () => false,
  decodeJwtPayload: () => null,
}));

const mockTabletState = { isTablet: false };
jest.mock("@/lib/use-is-tablet", () => ({
  useIsTablet: () => mockTabletState.isTablet,
}));

const RAW_PROVIDER_MESSAGE = "raw provider message: identifier not found";

async function renderForm() {
  const navigation = { navigate: jest.fn() } as unknown as RootStackScreenProps<"SignIn">["navigation"];
  const route = { key: "SignIn", name: "SignIn" } as unknown as RootStackScreenProps<"SignIn">["route"];
  await render(<ClerkSignInForm navigation={navigation} route={route} />);
}

beforeEach(() => {
  mockSubmitPassword.mockReset();
  mockStartSso.mockReset();
  mockFlow.ready = true;
  mockFlow.isSignedIn = false;
  mockFlow.isLoaded = true;
  mockFlow.fetchStatus = "idle";
  mockFlow.fieldErrors = { identifier: false, password: false };
  mockTabletState.isTablet = false;
  writeCarriedRole(null);
});

describe("branding", () => {
  it("renders the welcome header, subtitle and the Israeli phone hint", async () => {
    await renderForm();
    expect(screen.getByText(i18next.t("signIn.welcomeBack"))).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.subtitle"))).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.phoneHint"))).toBeTruthy();
    expect(screen.getByText("VetTrack")).toBeTruthy();
  });

  it("mounts the clerk-captcha bot-protection view (SSO can create a sign-up)", async () => {
    await renderForm();
    const mount = screen.getByTestId("clerk-captcha");
    expect(mount.props.nativeID).toBe("clerk-captcha");
  });
});

describe("SSO buttons", () => {
  it.each([
    ["sso-apple", "oauth_apple"],
    ["sso-google", "oauth_google"],
  ] as const)("%s starts the browser SSO flow with strategy %s", async (testId, strategy) => {
    mockStartSso.mockResolvedValue({ kind: "dismissed" });
    await renderForm();

    await fireEvent.press(screen.getByTestId(testId));

    await waitFor(() => expect(mockStartSso).toHaveBeenCalledWith(strategy));
  });

  it("an activated SSO session shows no error UI", async () => {
    mockStartSso.mockResolvedValue({ kind: "activated" });
    await renderForm();

    await fireEvent.press(screen.getByTestId("sso-google"));

    await waitFor(() => expect(mockStartSso).toHaveBeenCalled());
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });

  it("treats a dismissed flow (user cancelled) as SILENT — no error UI", async () => {
    mockStartSso.mockResolvedValue({ kind: "dismissed" });
    await renderForm();

    await fireEvent.press(screen.getByTestId("sso-apple"));

    await waitFor(() => expect(mockStartSso).toHaveBeenCalled());
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });

  it("surfaces the generic localized copy when the SSO flow rejects", async () => {
    mockStartSso.mockRejectedValue(new Error(RAW_PROVIDER_MESSAGE));
    await renderForm();

    await fireEvent.press(screen.getByTestId("sso-google"));

    await waitFor(() => expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy());
    expect(screen.queryByText(RAW_PROVIDER_MESSAGE)).toBeNull();
  });
});

describe("submit gating", () => {
  it("does not dispatch while the v4 resource is fetching", async () => {
    mockFlow.fetchStatus = "fetching";
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    expect(mockSubmitPassword).not.toHaveBeenCalled();
  });
});

describe("field-level errors", () => {
  it("renders localized identifier copy from the port's flags", async () => {
    mockFlow.fieldErrors = { identifier: true, password: false };
    await renderForm();

    expect(screen.getByText(i18next.t("signIn.identifierFieldError"))).toBeTruthy();
    expect(screen.queryByText(i18next.t("signIn.passwordFieldError"))).toBeNull();
  });

  it("renders localized password copy from the port's flags", async () => {
    mockFlow.fieldErrors = { identifier: false, password: true };
    await renderForm();

    expect(screen.getByText(i18next.t("signIn.passwordFieldError"))).toBeTruthy();
    expect(screen.queryByText(i18next.t("signIn.identifierFieldError"))).toBeNull();
  });
});

describe("role chips carry the requested role", () => {
  it("pressing a chip selects it and persists into the requested-role store", async () => {
    await renderForm();

    await fireEvent.press(screen.getByTestId("role-chip-vet"));

    expect(readCarriedRole()).toBe("vet");
    expect(screen.getByTestId("role-chip-vet").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("pre-selects a previously carried role on mount", async () => {
    writeCarriedRole("technician");
    await renderForm();

    expect(screen.getByTestId("role-chip-technician").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });
});

describe("tablet centered card (Slice 13)", () => {
  it("tablet: the card is centered and capped at AUTH_CARD_MAX_WIDTH", async () => {
    mockTabletState.isTablet = true;
    await renderForm();

    const style = StyleSheet.flatten(screen.getByTestId("signin-card").props.style);
    expect(style).toMatchObject({ alignSelf: "center", maxWidth: AUTH_CARD_MAX_WIDTH });
  });

  it("phone: the card stretches with no cap", async () => {
    await renderForm();

    const style = StyleSheet.flatten(screen.getByTestId("signin-card").props.style);
    expect(style.maxWidth).toBeUndefined();
  });
});

describe("loading gate (ClerkLoading analog)", () => {
  it("hides the form behind a spinner until the SDK client is loaded", async () => {
    mockFlow.isLoaded = false;
    await renderForm();

    expect(screen.queryByTestId("signin-submit")).toBeNull();
    expect(screen.getByTestId("signin-loading")).toBeTruthy();
  });
});
