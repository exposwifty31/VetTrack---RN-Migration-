/**
 * Pure decision for which top-level stack `RootNavigator` mounts, kept out of
 * the component so it is unit-testable (rn-architecture: gate side-effects in a
 * container, keep screens pure — the `resolveBootstrapView` precedent).
 *
 * React Navigation's auth pattern is a CONDITIONAL navigator: mount the auth
 * stack or the app stack, never both. Before this, `Main` was unconditionally
 * the first screen and `SignIn` was pushed over it, so a signed-out cold start
 * landed in the tab shell and let BootstrapGate paint a re-auth wall inside it.
 *
 * The no-key branch resolves to "app" deliberately. `isAuthSessionActive()` —
 * the seam that looks like the right signal — is only ever set by
 * `ClerkTokenBridge`, which mounts only when a publishable key exists. Routing
 * the no-key build to "auth" would strand it on a SignIn screen that can only
 * render its "missing key" notice. Dev-bypass gets its token from the dev seam
 * (`installDevAuthSeam`), so the app stack is correct and is what it did before.
 */
export type RootStackView = "loading" | "auth" | "app";

export interface RootStackViewInput {
  /** A Clerk publishable key is configured for this build. */
  clerkConfigured: boolean;
  /** Clerk has finished restoring any persisted session (`useAuth().isLoaded`). */
  clerkLoaded: boolean;
  /** Clerk reports an active session (`useAuth().isSignedIn`). */
  clerkSignedIn: boolean;
}

export function resolveRootStackView(input: RootStackViewInput): RootStackView {
  if (!input.clerkConfigured) return "app";
  // Hold the splash rather than flashing SignIn in front of a session that
  // SecureStore is about to restore.
  if (!input.clerkLoaded) return "loading";
  return input.clerkSignedIn ? "app" : "auth";
}
