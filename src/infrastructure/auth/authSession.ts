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

/**
 * Register (or clear) the active session's sign-out. Called by ClerkTokenBridge
 * under ClerkProvider; `null` on sign-out / when Clerk is absent (dev-bypass).
 */
export function setSessionSignOut(fn: (() => Promise<void>) | null): void {
  sessionSignOut = fn;
}

/**
 * Whether an interactive (Clerk) session is active and can be signed out. Read
 * at render to decide whether to offer the sign-out affordance — in dev-bypass
 * there is no session, so it stays false and the row is hidden.
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
