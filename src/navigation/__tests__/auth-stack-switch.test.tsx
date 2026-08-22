/**
 * The root navigator must mount the AUTH stack or the APP stack, never both.
 *
 * Before this, `Main` was registered unconditionally and `SignIn` was a screen
 * pushed on top of it. A signed-out cold start therefore booted into the tab
 * shell, and each tab's BootstrapGate painted a red "session expired" wall
 * inside it — tab bar drawn around the error, on an install that never had a
 * session. An App Review tester opening the app saw that error, not a sign-in.
 *
 * This suite reads `routeNames` off the LIVE navigation state rather than the
 * JSX, so it is a wiring check: it fails if the conditional is removed, because
 * `Main` would then be registered in the signed-out case. The
 * `navigator-reachability` suite covers the app branch's contents; this one
 * covers only which branch mounts.
 *
 * The no-key row is the important one. `isAuthSessionActive()` — the seam that
 * looks like the natural signal — is set only by `ClerkTokenBridge`, which
 * mounts only when a key is configured. Gating on it would strand the
 * dev-bypass build on a SignIn screen that can only show a "missing key"
 * notice. This pins the no-key build to the app stack.
 */
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";
import { useIdentity } from "@/app/useIdentity";
import {
  resetClerkAuthStateForTest,
  setClerkAuthState,
} from "@/infrastructure/auth/clerk-auth-state";

import { RootNavigator } from "../RootNavigator";
import type { RootStackParamList } from "../types";

jest.mock("@/app/useIdentity", () => ({
  useIdentity: jest.fn(),
  IDENTITY_QUERY_KEY: ["users", "me"],
}));
const mockedUseIdentity = useIdentity as jest.Mock;

/**
 * Drive the key through the env rather than mocking `AuthRoot`. The module
 * mock made the app-branch cases hang: mounting the real tab shell pulls
 * `AuthRoot` in transitively, and a partial mock left that path broken.
 * `resolveClerkPublishableKey` reads `process.env` at CALL time, so setting it
 * here exercises the real function.
 */
const REAL_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
function setClerkKey(value: string): void {
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = value;
}
afterAll(() => {
  // `process.env` stringifies whatever it is given, so assigning `undefined`
  // writes the literal "undefined" — a TRUTHY value that would leave every
  // later suite in this worker believing Clerk is configured. Restoring an
  // absent variable means deleting it.
  if (REAL_KEY === undefined) {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  } else {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = REAL_KEY;
  }
});

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function mountRoutes(): Promise<readonly string[]> {
  mockedUseIdentity.mockReturnValue({
    isPending: false,
    isSuccess: true,
    data: { id: "u1", effectiveRole: "technician" },
    error: null,
  });
  const navigationRef = createNavigationContainerRef<RootStackParamList>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navigationRef}>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

  await waitFor(() => expect(navigationRef.isReady()).toBe(true));
  return navigationRef.getRootState().routeNames ?? [];
}

beforeEach(() => {
  resetClerkAuthStateForTest();
  jest.clearAllMocks();
});

describe("root navigator mounts exactly one stack", () => {
  it("signed OUT: registers SignIn and does NOT register the tab shell", async () => {
    setClerkKey("pk_test_x");
    setClerkAuthState({ isLoaded: true, isSignedIn: false });

    const routes = await mountRoutes();

    expect(routes).toContain("SignIn");
    // The assertion that fails if the conditional is removed.
    expect(routes).not.toContain("Main");
  });

  it("still restoring: holds AuthLoading, so SignIn never flashes over a returning session", async () => {
    setClerkKey("pk_test_x");
    setClerkAuthState({ isLoaded: false, isSignedIn: false });

    const routes = await mountRoutes();

    expect(routes).toEqual(["AuthLoading"]);
  });

  /**
   * Both signed-in facts in ONE mount. They were two tests that each mounted the
   * navigator and re-asserted "Main is registered"; the second fact is the
   * regression, not a separate scenario (SonarCloud S5976).
   *
   * THE REGRESSION, observed on the iPad sim: BOTH branches used to register a
   * route named "SignIn". React Navigation keeps the CURRENT route across a
   * config change when the new config still declares it, so signing in swapped
   * the branch but left the user parked on SignIn's post-sign-in interstitial
   * ("מחובר" + a manual "go home" button) instead of landing on Main.
   */
  it("signed IN: registers the tab shell and does NOT re-register SignIn", async () => {
    setClerkKey("pk_test_x");
    setClerkAuthState({ isLoaded: true, isSignedIn: true });

    const routes = await mountRoutes();

    expect(routes).toContain("Main");
    expect(routes).not.toContain("AuthLoading");
    // Fails if the app branch re-registers SignIn — the iPad-sim regression.
    expect(routes).not.toContain("SignIn");
  });

  it("no Clerk key (dev-bypass): registers the tab shell AND keeps SignIn reachable", async () => {
    setClerkKey("");
    setClerkAuthState({ isLoaded: false, isSignedIn: false });

    const routes = await mountRoutes();

    // Never stranded on an auth branch that this build cannot complete.
    expect(routes).toContain("Main");
    // No auth branch exists here, so there is no name collision and
    // BootstrapGate's navigate("SignIn") must still resolve.
    expect(routes).toContain("SignIn");
  });
});

