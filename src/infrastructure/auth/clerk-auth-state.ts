/**
 * Clerk's `{ isLoaded, isSignedIn }` pushed into a framework-free seam, mirroring
 * the token seam in `auth-fetch.ts` and the sign-out seam in `authSession.ts`.
 *
 * `RootNavigator` needs Clerk's auth state to choose between the auth stack and
 * the app stack, but it cannot call `useAuth()`: `ClerkProvider` only mounts when
 * a publishable key is configured (see `AuthRoot`), so that hook would throw on
 * the no-key build. `ClerkTokenBridge` is the one component already guaranteed to
 * render under the provider, so it publishes here and the navigator subscribes.
 *
 * Default is `{ isLoaded: false, isSignedIn: false }` — "Clerk has not reported
 * yet". `resolveRootStackView` maps that to the splash for a keyed build, and
 * ignores it entirely for a no-key build.
 */
export interface ClerkAuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
}

let state: ClerkAuthState = { isLoaded: false, isSignedIn: false };

const listeners = new Set<() => void>();

/** Publish Clerk's auth state. Called by `ClerkTokenBridge` under ClerkProvider. */
export function setClerkAuthState(next: ClerkAuthState): void {
  if (next.isLoaded === state.isLoaded && next.isSignedIn === state.isSignedIn) return;
  // Replace, never mutate: `getClerkAuthState` is a useSyncExternalStore
  // snapshot and must return a stable reference between real changes or React
  // re-renders forever.
  state = next;
  for (const listener of listeners) listener();
}

/** Subscribe to Clerk auth-state changes (for `useSyncExternalStore`). */
export function subscribeClerkAuthState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The `useSyncExternalStore` snapshot. Stable between real changes. */
export function getClerkAuthState(): ClerkAuthState {
  return state;
}

/** Test-only reset so suites do not leak state into one another. */
export function resetClerkAuthStateForTest(): void {
  state = { isLoaded: false, isSignedIn: false };
  listeners.clear();
}
