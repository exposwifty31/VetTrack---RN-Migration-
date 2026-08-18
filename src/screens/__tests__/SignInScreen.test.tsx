/**
 * W3a / SignInScreen: a failed sign-in must surface GENERIC, translated copy —
 * never the raw provider error message (which can carry authorization internals).
 *
 * W-AUTH (PR #75): the screen consumes the SignInFlowPort ADAPTER
 * (@/infrastructure/auth/useSignInFlow) — so these tests mock the adapter, not
 * Clerk. The v4 mechanism (password/finalize/returned-error shapes) is pinned
 * in the adapter's own suite; here we pin the screen's outcome->copy mapping.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import i18next from "@/i18n/config";
import type { SignInFlowPort } from "@/core/ports/sign-in-flow.port";

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

const SENSITIVE = "azp mismatch: internal_secret_party";

async function renderForm() {
  // Minimal navigation/route stubs — the form only calls navigation.navigate.
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
});

describe("SignInScreen error handling", () => {
  it("maps a failed outcome to generic translated copy — the raw cause is never rendered", async () => {
    mockSubmitPassword.mockResolvedValue({ kind: "failed", cause: new Error(SENSITIVE) });
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
  });

  it("maps a rejection to the same generic translated copy", async () => {
    mockSubmitPassword.mockRejectedValue(new Error(SENSITIVE));
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(screen.getByText(i18next.t("signIn.error"))).toBeTruthy();
    });
    expect(screen.queryByText(SENSITIVE)).toBeNull();
  });

  it("surfaces the incomplete-status copy for an incomplete outcome", async () => {
    mockSubmitPassword.mockResolvedValue({ kind: "incomplete", status: "needs_second_factor" });
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(i18next.t("signIn.incomplete", { status: "needs_second_factor" })),
      ).toBeTruthy();
    });
  });
});

describe("SignInScreen diagnostics", () => {
  it("does not report a failure when only the DEV azp diagnostic throws", async () => {
    // The diagnostic runs AFTER the flow completes — the session is already
    // live. A rejecting resolveToken() reaching the outer catch would paint
    // "sign-in failed" over a sign-in that worked, and the user would retry a
    // session they already have.
    mockSubmitPassword.mockResolvedValue({ kind: "complete" });
    const { resolveToken } = jest.requireMock("@/lib/auth-fetch") as {
      resolveToken: jest.Mock;
    };
    resolveToken.mockRejectedValueOnce(new Error("keychain unavailable"));

    // Waiting on submitPassword alone is not enough: the diagnostic starts
    // AFTER a zero-delay timer, so the assertion could run before a leaked
    // rejection had a chance to call setError() — passing for the wrong
    // reason. Wait for the diagnostic's own log, which only the isolated path
    // emits.
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    try {
      await renderForm();
      await fireEvent.press(screen.getByTestId("signin-submit"));

      await waitFor(() => expect(mockSubmitPassword).toHaveBeenCalled());
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
    mockSubmitPassword.mockResolvedValue({ kind: "complete" });
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

    // Identifier is trimmed before dispatch; the password is passed verbatim.
    await waitFor(() =>
      expect(mockSubmitPassword).toHaveBeenCalledWith("vet@example.com", "hunter2!"),
    );
    expect(screen.queryByText(i18next.t("signIn.error"))).toBeNull();
  });

  it("does not dispatch while the flow port is not ready", async () => {
    mockFlow.ready = false;
    await renderForm();

    await fireEvent.press(screen.getByTestId("signin-submit"));

    expect(mockSubmitPassword).not.toHaveBeenCalled();
  });
});
