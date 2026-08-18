/**
 * W-AUTH PR-C / SignInScreen dismissal.
 *
 * SignIn is PUSHED OVER `Main` (BootstrapGate re-auth, MenuScreen sign-out), so
 * the way off it must POP. React Navigation 7 changed `navigate`: its
 * StackRouter only reuses an existing route when that route is the CURRENT one
 * (or when `popTo` sets `payload.pop`) — otherwise it appends a brand-new route
 * (`StackRouter.tsx` NAVIGATE, the `else` branch). So `navigate("Main")` from
 * SignIn cannot dismiss SignIn; it stacks a duplicate MainTabs instead, which
 * on device reads as "the button does nothing" (verified iPad sim 2026-08-19:
 * TodayTabScreen mounted and live behind a SignIn that would not close).
 *
 * These tests pin the pop, the cold-boot fallback, and the auto-dismiss.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import i18next from "@/i18n/config";
import type { SignInFlowPort } from "@/core/ports/sign-in-flow.port";

import type { RootStackScreenProps } from "../../navigation/types";
import { ClerkSignInForm, SignInScreen } from "../SignInScreen";

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
  submitPassword: jest.fn(),
  startSso: jest.fn(),
};

jest.mock("@/infrastructure/auth/useSignInFlow", () => ({
  useSignInFlow: (): SignInFlowPort => mockFlow,
}));

jest.mock("@/lib/auth-fetch", () => ({
  resolveToken: jest.fn(async () => null),
  isValidJwt: () => false,
  decodeJwtPayload: () => null,
}));

/** A navigation stub whose history depth is the variable under test. */
function makeNavigation(canGoBack: boolean) {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => canGoBack),
  };
}

function screenProps(canGoBack: boolean) {
  const navigation = makeNavigation(canGoBack);
  return {
    navigation,
    props: {
      navigation: navigation as unknown as RootStackScreenProps<"SignIn">["navigation"],
      route: { key: "SignIn", name: "SignIn" } as unknown as RootStackScreenProps<"SignIn">["route"],
    },
  };
}

beforeEach(() => {
  mockFlow.ready = true;
  mockFlow.isSignedIn = false;
  mockFlow.isLoaded = true;
  mockFlow.fetchStatus = "idle";
  mockFlow.fieldErrors = { identifier: false, password: false };
});

describe("SignInScreen dismissal", () => {
  it("pops the pushed SignIn instead of stacking a duplicate Main", async () => {
    mockFlow.isSignedIn = true;
    const { navigation, props } = screenProps(true);

    await render(<ClerkSignInForm {...props} />);
    await fireEvent.press(screen.getByText(i18next.t("signIn.goHome")));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("falls back to Main when SignIn is the only route (cold-boot deep link)", async () => {
    mockFlow.isSignedIn = true;
    const { navigation, props } = screenProps(false);

    await render(<ClerkSignInForm {...props} />);
    await fireEvent.press(screen.getByText(i18next.t("signIn.goHome")));

    expect(navigation.navigate).toHaveBeenCalledWith("Main");
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("auto-dismisses once the session lands — no button press required", async () => {
    const { navigation, props } = screenProps(true);
    const view = await render(<ClerkSignInForm {...props} />);

    expect(navigation.goBack).not.toHaveBeenCalled();

    mockFlow.isSignedIn = true;
    await view.rerender(<ClerkSignInForm {...props} />);

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));

    // Latched: a further re-render must not pop a second time.
    await view.rerender(<ClerkSignInForm {...props} />);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("does not auto-dismiss when it mounts already signed in — the re-auth path must keep the form reachable", async () => {
    mockFlow.isSignedIn = true;
    const { navigation, props } = screenProps(true);

    await render(<ClerkSignInForm {...props} />);

    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("pops from the missing-publishable-key branch too", async () => {
    const { navigation, props } = screenProps(true);

    await render(<SignInScreen {...props} />);
    await fireEvent.press(screen.getByText(i18next.t("common.back")));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
