/**
 * App-wide `AuthSessionPort` instance + a sign-out seam, mirroring the token
 * seam in `auth-fetch.ts` (`setClerkTokenGetter`). Components under
 * `src/{screens,features,components}/**` sign out through this PORT — they never
 * import `@clerk/clerk-expo` directly (the coding-guideline / hexagonal boundary).
 *
 * `ClerkTokenBridge` (the one place already under `ClerkProvider`) registers the
 * live Clerk `signOut` via `setSessionSignOut`; in dev-bypass no key is present,
 * `ClerkProvider`/`ClerkTokenBridge` never mount, the seam stays `null`, and the
 * adapter's `signOut()` becomes a safe no-op. That is how the adapter "resolves
 * the dev-bypass case internally" — the call site needs no env gate.
 */
import type { AuthSessionPort } from "@/core/ports/auth.port";
import { ClerkAuthAdapter } from "./ClerkAuthAdapter";

let sessionSignOut: (() => Promise<void>) | null = null;

// Availability subscribers — so UI can react to sign-in/out registration rather
// than reading a stale module value once at render (useSyncExternalStore).
const availabilityListeners = new Set<() => void>();

/**
 * Register (or clear) the active session's sign-out. Called by ClerkTokenBridge
 * under ClerkProvider; `null` on sign-out / when Clerk is absent (dev-bypass).
 * Notifies availability subscribers only when the active/inactive state flips.
 */
export function setSessionSignOut(fn: (() => Promise<void>) | null): void {
  const wasActive = sessionSignOut !== null;
  sessionSignOut = fn;
  const isActive = fn !== null;
  if (isActive !== wasActive) {
    for (const listener of availabilityListeners) listener();
  }
}

/**
 * Subscribe to session availability changes (for `useSyncExternalStore`). Returns
 * an unsubscribe fn. Pairs with `isAuthSessionActive` as the snapshot.
 */
export function subscribeAuthSession(listener: () => void): () => void {
  availabilityListeners.add(listener);
  return () => {
    availabilityListeners.delete(listener);
  };
}

/**
 * Whether an interactive (Clerk) session is active and can be signed out — the
 * `useSyncExternalStore` snapshot. In dev-bypass there is no session, so it stays
 * false and the sign-out affordance stays hidden.
 */
export function isAuthSessionActive(): boolean {
  return sessionSignOut !== null;
}

// One port instance; its signOut resolves the current seam value each call, so a
// re-registered getter (account switch) is always honored.
const authSession: AuthSessionPort = new ClerkAuthAdapter(async () => {
  if (sessionSignOut) await sessionSignOut();
});

/** The app's AuthSessionPort — the only sign-out path for UI code. */
export function getAuthSession(): AuthSessionPort {
  return authSession;
}
