/**
 * Dev-only bearer seam.
 *
 * WHY THIS EXISTS. `authFetch` fails closed: with no valid JWT it throws
 * `AUTH_INVALID` *before* any network dispatch. That is correct for production,
 * but it also means a simulator/emulator build with no Clerk key can never reach
 * a local dev API. Worse, `BootstrapGate` blocks the whole app below Home when
 * `getCurrentUserId()` is empty, so Equipment / Rooms / Tasks render the re-auth
 * screen instead of themselves. That made the Slice-13 iPad layout unobservable
 * and makes E2E automation impossible to write.
 *
 * NO CREDENTIAL PASSES THROUGH CONFIG. The opt-in is a boolean flag, and the
 * token is a fixed placeholder compiled into this file. Expo's documented
 * contract for `EXPO_PUBLIC_*` is that the CLI inlines these values into the
 * bundle in plain text — "Do not store sensitive info, such as private keys, in
 * EXPO_PUBLIC_ variables. These variables will be visible in plain-text in your
 * compiled application." (https://docs.expo.dev/guides/environment-variables/).
 * An env var *named* for a bearer token invites someone to paste a real one,
 * which would then be readable in every binary built on that machine. A flag
 * cannot be misused that way.
 *
 * WHAT THIS IS NOT. It is not an auth bypass. It does not weaken `authFetch`,
 * does not touch the Clerk path, and cannot grant access to anything:
 *
 *   1. `__DEV__` only — the body is dead code in a release bundle.
 *   2. Opt-in — inert unless `EXPO_PUBLIC_DEV_AUTH` is explicitly enabled.
 *   3. Refuses when a Clerk publishable key is configured, so it can never be
 *      active in a build that has a real auth path.
 *   4. It writes the FALLBACK slot only. `resolveToken()` prefers the Clerk
 *      getter, so a real signed-in session always wins.
 *   5. The server still authenticates. The placeholder declares `alg: "none"`
 *      and its two claims (`sub`, `note`) name it as a placeholder rather than
 *      identifying any principal, so a Clerk-backed server rejects it with 401
 *      exactly like any other garbage. It is only useful against a server
 *      already running in dev-bypass, which trusts no token at all — so the
 *      seam grants no authority that the server was withholding.
 *
 * In one line: it stops the CLIENT from short-circuiting, and lets the SERVER
 * make the decision it was always going to make.
 */

import { isValidJwt } from "@/lib/auth-fetch";
import { setStoredBearerToken } from "@/lib/auth-store";

/**
 * Inert, self-describing stand-in that exists only to satisfy the client-side
 * JWT-shape gate in `authFetch` (`isValidJwt` = three dot-separated segments).
 *
 * It is a constant on purpose: nothing secret should ever be configurable here.
 * The payload decodes to `{"sub":"dev-bypass-placeholder","note":"not-a-credential"}`
 * and the header declares `alg: "none"`, so anyone who finds this string in a
 * bundle can see at a glance that it authenticates nothing.
 */
export const DEV_PLACEHOLDER_BEARER =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." +
  "eyJzdWIiOiJkZXYtYnlwYXNzLXBsYWNlaG9sZGVyIiwibm90ZSI6Im5vdC1hLWNyZWRlbnRpYWwifQ." +
  "not-a-signature";

/** Why the seam did not install — surfaced for tests and the dev log line. */
export type DevAuthSkipReason = "release-build" | "not-enabled" | "clerk-configured";

export type DevAuthResult =
  | { readonly installed: true }
  | { readonly installed: false; readonly reason: DevAuthSkipReason };

/** `"1"` / `"true"` (any case, trimmed) enable it. Everything else does not. */
export function isDevAuthFlagEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Pure decision so the guard rails are testable without a bundler or a runtime. */
export function resolveDevAuth(input: {
  readonly isDev: boolean;
  readonly devAuthFlag: string | undefined;
  readonly clerkPublishableKey: string | undefined;
}): DevAuthResult {
  if (!input.isDev) return { installed: false, reason: "release-build" };

  if (!isDevAuthFlagEnabled(input.devAuthFlag)) {
    return { installed: false, reason: "not-enabled" };
  }

  // Belt and braces: a build that has a real auth path must never carry a
  // fallback token, even in dev.
  if (input.clerkPublishableKey?.trim()) {
    return { installed: false, reason: "clerk-configured" };
  }

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
    devAuthFlag: process.env.EXPO_PUBLIC_DEV_AUTH,
    clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  if (result.installed) {
    setStoredBearerToken(DEV_PLACEHOLDER_BEARER);
  }

  return result;
}

/** Exported so a test can pin that the constant still satisfies authFetch's gate. */
export function placeholderSatisfiesJwtShapeGate(): boolean {
  return isValidJwt(DEV_PLACEHOLDER_BEARER);
}
