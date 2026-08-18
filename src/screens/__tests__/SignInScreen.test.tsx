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

    // Waiting on setActive() alone is not enough: the diagnostic starts AFTER a
    // zero-delay timer, so the assertion could run before a leaked rejection had
    // a chance to call setError() — passing for the wrong reason. Wait for the
    // diagnostic's own log, which only the isolated path emits.
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    try {
      await renderForm();
      fireEvent.press(screen.getByTestId("signin-submit"));

      await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
      await waitFor(() =>
        expect(debugSpy).toHaveBeenCalledWith("[SignIn] azp diagnostic failed", expect.any(Error)),
      );
      expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

describe("SignInScreen submit contract (W-AUTH pin)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockSetActive.mockReset();
  });

  it("renders the credential form and a successful submit shows no error", async () => {
    mockCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_ok" });
    await renderForm();

    // The minimal form surface: email + password fields and the submit control.
    await fireEvent.changeText(
      screen.getByPlaceholderText(i18next.t("signIn.email")),
      "  vet@example.com ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText(i18next.t("signIn.password")),
      "hunter2!",
    );
    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_ok" }));
    // Identifier is trimmed before dispatch; the password is passed verbatim.
    expect(mockCreate).toHaveBeenCalledWith({
      identifier: "vet@example.com",
      password: "hunter2!",
    });
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });
});
