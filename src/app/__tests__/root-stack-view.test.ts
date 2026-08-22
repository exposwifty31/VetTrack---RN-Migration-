/**
 * Which top-level stack the app mounts. Before this existed, `RootNavigator`
 * had no auth switch at all: `Main` was unconditionally the first screen and
 * `SignIn` was a screen you PUSHED on top of it. A signed-out cold start
 * therefore booted into the tab shell and let each tab's BootstrapGate paint a
 * red "session expired" wall inside it — with the tab bar drawn around the
 * error, and "expired" describing a session that never existed.
 *
 * THE TRAP THIS ENCODES. The obvious signal, `isAuthSessionActive()`, is
 * `sessionSignOut !== null`, and only `ClerkTokenBridge` ever sets it. That
 * bridge mounts ONLY when a publishable key is configured. Gating the root on
 * it would leave the dev-bypass build (no key) permanently on SignIn — a
 * lockout with no way forward, since SignInScreen without a key renders only
 * its "missing key" notice. The no-key branch must therefore resolve to the
 * app, which is what it did before this change.
 */
import { resolveRootStackView } from "../root-stack-view";

describe("resolveRootStackView", () => {
  it("shows the app when Clerk is not configured (dev-bypass must never be locked out)", () => {
    expect(
      resolveRootStackView({ clerkConfigured: false, clerkLoaded: false, clerkSignedIn: false }),
    ).toBe("app");
  });

  it("waits while Clerk is configured but still loading, so no SignIn flash precedes a restored session", () => {
    expect(
      resolveRootStackView({ clerkConfigured: true, clerkLoaded: false, clerkSignedIn: false }),
    ).toBe("loading");
  });

  it("shows SignIn on a signed-out cold start instead of the tab shell", () => {
    expect(
      resolveRootStackView({ clerkConfigured: true, clerkLoaded: true, clerkSignedIn: false }),
    ).toBe("auth");
  });

  it("shows the app once Clerk reports a session", () => {
    expect(
      resolveRootStackView({ clerkConfigured: true, clerkLoaded: true, clerkSignedIn: true }),
    ).toBe("app");
  });

  it("never reports loading once Clerk has loaded, in either signed state", () => {
    for (const clerkSignedIn of [true, false]) {
      expect(
        resolveRootStackView({ clerkConfigured: true, clerkLoaded: true, clerkSignedIn }),
      ).not.toBe("loading");
    }
  });
});
