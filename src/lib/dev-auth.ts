/**
 * Dev-only bearer seam.
 *
 * WHY THIS EXISTS. `authFetch` fails closed: with no valid JWT it throws
 * `AUTH_INVALID` *before* any network dispatch. That is correct for production,
 * but it also means a simulator/emulator build with no Clerk key can never reach
 * a local dev API — every list renders empty. That blocked the Slice-13 iPad
 * screenshot gate and blocks E2E automation generally, because there was no way
 * to put the client into a "let the request through" state.
 *
 * WHAT THIS IS NOT. It is not an auth bypass. It does not weaken `authFetch`,
 * does not touch the Clerk path, and cannot grant access to anything:
 *
 *   1. `__DEV__` only — the body is dead code in a release bundle.
 *   2. Opt-in — inert unless `EXPO_PUBLIC_DEV_BEARER_TOKEN` is explicitly set.
 *   3. Refuses when a Clerk publishable key is configured, so it can never be
 *      active in a build that has a real auth path.
 *   4. It writes the FALLBACK slot only. `resolveToken()` prefers the Clerk
 *      getter, so a real signed-in session always wins.
 *   5. The server still authenticates. Against a Clerk-backed server this token
 *      is rejected with 401 exactly like any other garbage. It is only useful
 *      against a server already running in dev-bypass, which trusts no token at
 *      all — so the seam grants no authority that the server was withholding.
 *
 * In one line: it stops the CLIENT from short-circuiting, and lets the SERVER
 * make the decision it was always going to make.
 */

import { isValidJwt } from "@/lib/auth-fetch";
import { setStoredBearerToken } from "@/lib/auth-store";

/** Why the seam did not install — surfaced for the dev-only log line and tests. */
export type DevAuthSkipReason =
  | "release-build"
  | "not-configured"
  | "clerk-configured"
  | "malformed-token";

export type DevAuthResult =
  | { readonly installed: true }
  | { readonly installed: false; readonly reason: DevAuthSkipReason };

/** Pure decision so the guard rails are testable without a bundler or a runtime. */
export function resolveDevAuth(input: {
  readonly isDev: boolean;
  readonly devToken: string | undefined;
  readonly clerkPublishableKey: string | undefined;
}): DevAuthResult {
  if (!input.isDev) return { installed: false, reason: "release-build" };

  const token = input.devToken?.trim();
  if (!token) return { installed: false, reason: "not-configured" };

  // Belt and braces: a build that has a real auth path must never carry a
  // fallback token, even in dev.
  if (input.clerkPublishableKey?.trim()) {
    return { installed: false, reason: "clerk-configured" };
  }

  // Fail loud rather than storing something `authFetch` will reject anyway.
  if (!isValidJwt(token)) return { installed: false, reason: "malformed-token" };

  return { installed: true };
}

/**
 * Install the seam. Call once at module scope in the app root, before the first
 * render, so the identity bootstrap query already sees the token.
 * Returns whether it installed, for the caller's dev log line.
 */
export function installDevAuthSeam(): DevAuthResult {
  const result = resolveDevAuth({
    isDev: __DEV__,
    devToken: process.env.EXPO_PUBLIC_DEV_BEARER_TOKEN,
    clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  if (result.installed) {
    setStoredBearerToken(process.env.EXPO_PUBLIC_DEV_BEARER_TOKEN!.trim());
  }

  return result;
}
