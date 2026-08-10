/** Minimal client auth store — bearer fallback + user id for authFetch guards. */

let storedBearerToken: string | null = null;
let currentUserId: string | null = null;

/**
 * Monotonic counter bumped on every real identity transition (see
 * `setCurrentUserId` below and `setClerkTokenGetter` in auth-fetch.ts, which
 * also bumps it directly rather than relying on a listener reacting to its
 * notification — see that call site for why). Used by `resolveAuthSnapshot`
 * (auth-fetch.ts) to detect a TOCTOU window between resolving a bearer token
 * and reading the owning userId for the SAME logical operation — CodeRabbit
 * PR #51's critical finding: a pass-level token combined with a per-item (or
 * even per-request) identity read can pair user A's token with user B's
 * write if the account changes in between. A revision mismatch means "the
 * identity moved during resolution" — the caller must treat the snapshot as
 * unusable, never patch it together from two different reads.
 */
let identityRevision = 0;

export function getStoredBearerToken(): string | null {
  return storedBearerToken;
}

export function setStoredBearerToken(token: string | null): void {
  storedBearerToken = token;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function setCurrentUserId(userId: string | null): void {
  if (userId !== currentUserId) {
    identityRevision += 1;
  }
  currentUserId = userId;
}

export function getIdentityRevision(): number {
  return identityRevision;
}

/**
 * Explicit bump for identity-adjacent transitions that don't (yet) change
 * `currentUserId` itself — e.g. `setClerkTokenGetter`'s ready/changed/cleared
 * signal fires before `useIdentity.ts`'s listener gets a chance to null out
 * the stale userId. A security-critical revision check must not depend on a
 * React hook being mounted to keep the counter honest.
 */
export function bumpIdentityRevision(): void {
  identityRevision += 1;
}

/** Test-only — reset module-lifetime auth state between cases. */
export function _resetAuthStoreForTests(): void {
  storedBearerToken = null;
  currentUserId = null;
  identityRevision = 0;
}
