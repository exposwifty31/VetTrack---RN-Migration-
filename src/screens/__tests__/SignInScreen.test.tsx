/**
 * W3a / SignInScreen: a failed sign-in must surface GENERIC, translated copy —
 * never the raw provider error message (which can carry authorization internals).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import i18next from "@/i18n/config";

import type { RootStackScreenProps } from "../../navigation/types";
import { ClerkSignInForm } from "../SignInScreen";

const mockCreate = jest.fn();
const mockSetActive = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: { create: mockCreate }, setActive: mockSetActive }),
  useAuth: () => ({ isSignedIn: false }),
}));

jest.mock("@/lib/auth-fetch", () => ({
  resolveToken: jest.fn(async () => null),
  isValidJwt: () => false,
  decodeJwtPayload: () => null,
}));

const SENSITIVE = "azp mismatch: internal_secret_party";

async function renderForm() {
  // Minimal navigation/route stubs — the form only calls navigation.navigate.
  const navigation = { navigate: jest.fn() } as unknown as RootStackScreenProps<"SignIn">["navigation"];
  const route = { key: "SignIn", name: "SignIn" } as unknown as RootStackScreenProps<"SignIn">["route"];
  await render(<ClerkSignInForm navigation={navigation} route={route} />);
}

describe("SignInScreen error handling", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockSetActive.mockReset();
  });

  it("shows generic translated copy and never the raw provider message", async () => {
    mockCreate.mockRejectedValue(new Error(SENSITIVE));
    await renderForm();

    fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
  });
});

describe("SignInScreen diagnostics", () => {
  it("does not report a failure when only the DEV azp diagnostic throws", async () => {
    // The diagnostic runs AFTER setActive() — the session is already live. A
    // rejecting resolveToken() reaching the outer catch would paint "sign-in
    // failed" over a sign-in that worked, and the user would retry a session
    // they already have.
    mockCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    const { resolveToken } = jest.requireMock("@/lib/auth-fetch") as {
      resolveToken: jest.Mock;
    };
    resolveToken.mockRejectedValueOnce(new Error("keychain unavailable"));

    await renderForm();
    fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });
});
