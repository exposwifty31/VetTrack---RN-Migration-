/**
 * W3a / SignInScreen: a failed sign-in must surface GENERIC, translated copy —
 * never the raw provider error message (which can carry authorization internals).
 *
 * W-AUTH (PR-A): mocks follow the @clerk/expo v4 method-based custom-flow API —
 * `useSignIn()` returns `{ signIn, errors, fetchStatus }`; the flow is
 * `signIn.password()` -> check `{ error }` -> `signIn.status === "complete"` ->
 * `signIn.finalize()`. The behavioral invariants pinned here predate the swap.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import i18next from "@/i18n/config";

import type { RootStackScreenProps } from "../../navigation/types";
import { ClerkSignInForm } from "../SignInScreen";

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockSignIn: { status: string; password: jest.Mock; finalize: jest.Mock } = {
  status: "needs_first_factor",
  password: mockPassword,
  finalize: mockFinalize,
};

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: mockSignIn,
    errors: { fields: { identifier: null, password: null }, raw: null, global: null },
    fetchStatus: "idle",
  }),
  useAuth: () => ({ isSignedIn: false }),
}));

jest.mock("@/lib/auth-fetch", () => ({
  resolveToken: jest.fn(async () => null),
  isValidJwt: () => false,
  decodeJwtPayload: () => null,
}));

const SENSITIVE = "azp mismatch: internal_secret_party";

/** password() succeeds and (like the real SignInFuture) mutates status in place. */
function passwordSucceeds() {
  mockPassword.mockImplementation(async () => {
    mockSignIn.status = "complete";
    return { error: null };
  });
}

async function renderForm() {
  // Minimal navigation/route stubs — the form only calls navigation.navigate.
  const navigation = { navigate: jest.fn() } as unknown as RootStackScreenProps<"SignIn">["navigation"];
  const route = { key: "SignIn", name: "SignIn" } as unknown as RootStackScreenProps<"SignIn">["route"];
  await render(<ClerkSignInForm navigation={navigation} route={route} />);
}

beforeEach(() => {
  mockPassword.mockReset();
  mockFinalize.mockReset();
  mockSignIn.status = "needs_first_factor";
});

describe("SignInScreen error handling", () => {
  it("shows generic translated copy when password() returns an error object", async () => {
    // v4 reports flow failures as a RETURNED error, not a rejection.
    mockPassword.mockResolvedValue({ error: new Error(SENSITIVE) });
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("shows generic translated copy when password() rejects, never the raw message", async () => {
    mockPassword.mockRejectedValue(new Error(SENSITIVE));
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
  });

  it("shows generic translated copy when finalize() returns an error object", async () => {
    passwordSucceeds();
    mockFinalize.mockResolvedValue({ error: new Error(SENSITIVE) });
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
  });
});

describe("SignInScreen diagnostics", () => {
  it("does not report a failure when only the DEV azp diagnostic throws", async () => {
    // The diagnostic runs AFTER finalize() — the session is already live. A
    // rejecting resolveToken() reaching the outer catch would paint "sign-in
    // failed" over a sign-in that worked, and the user would retry a session
    // they already have.
    passwordSucceeds();
    mockFinalize.mockResolvedValue({ error: null });
    const { resolveToken } = jest.requireMock("@/lib/auth-fetch") as {
      resolveToken: jest.Mock;
    };
    resolveToken.mockRejectedValueOnce(new Error("keychain unavailable"));

    // Waiting on finalize() alone is not enough: the diagnostic starts AFTER a
    // zero-delay timer, so the assertion could run before a leaked rejection had
    // a chance to call setError() — passing for the wrong reason. Wait for the
    // diagnostic's own log, which only the isolated path emits.
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    try {
      await renderForm();
      await fireEvent.press(screen.getByTestId("signin-submit"));

      await waitFor(() => expect(mockFinalize).toHaveBeenCalled());
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
  it("renders the credential form and a successful submit shows no error", async () => {
    passwordSucceeds();
    mockFinalize.mockResolvedValue({ error: null });
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

    await waitFor(() => expect(mockFinalize).toHaveBeenCalled());
    // Identifier is trimmed before dispatch; the password is passed verbatim.
    expect(mockPassword).toHaveBeenCalledWith({
      emailAddress: "vet@example.com",
      password: "hunter2!",
    });
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });

  it("surfaces the incomplete status copy when the flow needs another factor", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignIn.status = "needs_second_factor";
      return { error: null };
    });
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(i18next.t("signIn.incomplete", { status: "needs_second_factor" })),
      ).toBeTruthy();
    });
    expect(mockFinalize).not.toHaveBeenCalled();
  });
});
