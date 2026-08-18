/**
 * Pure-unit tests for the bootstrap gate's view decision (fix a): a signed-OUT
 * cold-start / failed identity must offer a route to SignIn, not a retry-only
 * dead-end. A signed-IN-but-not-ready user (e.g. pending approval) keeps retry.
 */
import { resolveBootstrapView } from "../bootstrap-view";

describe("resolveBootstrapView", () => {
  it("shows loading while the identity query is pending", () => {
    expect(
      resolveBootstrapView({
        isPending: true,
        isSuccess: false,
        hasUserId: false,
        effectiveRole: null,
        hasActiveSession: false,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("is ready when identity resolved, userId present, and role clears the student floor", () => {
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: true,
        hasUserId: true,
        effectiveRole: "technician",
        hasActiveSession: true,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("offers SignIn when not ready and NO active session (signed-out cold start) — the fix", () => {
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: false,
        hasUserId: false,
        effectiveRole: null,
        hasActiveSession: false,
      }),
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false, canRetry: false });
  });

  it("keeps retry-only when not ready but a session IS active (e.g. role below floor)", () => {
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: true,
        hasUserId: true,
        effectiveRole: "guest", // unknown role ranks 0 — below the student floor
        hasActiveSession: true,
      }),
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: false, canRetry: true });
  });

  it("treats a resolved identity missing a userId as not-ready", () => {
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: true,
        hasUserId: false,
        effectiveRole: "technician",
        hasActiveSession: false,
      }),
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false, canRetry: false });
  });

  it("offers sign-out-and-sign-in when identity FAILED with an AUTH error despite an active session — the stale-session wall", () => {
    // Real repro (Pixel 7, 2026-08-12): persisted Clerk session for a user the server
    // rejects → users/me 403 forever. Retry can only fail; SignIn alone is wrong (a
    // dead session must be cleared first). The gate must offer re-authentication.
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: false,
        hasUserId: false,
        effectiveRole: null,
        hasActiveSession: true,
        isAuthError: true,
      }),
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: true, canRetry: false });
  });

  it("keeps plain retry for a NON-auth identity failure with an active session (network blip)", () => {
    expect(
      resolveBootstrapView({
        isPending: false,
        isSuccess: false,
        hasUserId: false,
        effectiveRole: null,
        hasActiveSession: true,
        isAuthError: false,
      }),
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: false, canRetry: true });
  });
});

describe("sticky readiness — a transient flap must not unmount a live Home (iPad rotation bug, 2026-08-19)", () => {
  const base = {
    isPending: false,
    isSuccess: false,
    hasUserId: false,
    effectiveRole: null,
    hasActiveSession: false,
  } as const;

  it("stays ready through a transient failure once latched, while identity data is still present", () => {
    expect(
      resolveBootstrapView({ ...base, wasReady: true, hasData: true }),
    ).toEqual({ kind: "ready" });
  });

  it("a settled 401/403 still flips a latched gate to reauth — real session death wins", () => {
    expect(
      resolveBootstrapView({
        ...base,
        hasActiveSession: true,
        isAuthError: true,
        wasReady: true,
        hasData: true,
      }),
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: true, canRetry: false });
  });

  it("a cold start never latches — signed-out still routes to SignIn", () => {
    expect(
      resolveBootstrapView({ ...base, wasReady: false, hasData: false }),
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false, canRetry: false });
  });

  it("latched but data evaporated -> not sticky (nothing to render Home from)", () => {
    expect(
      resolveBootstrapView({ ...base, wasReady: true, hasData: false }),
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false, canRetry: false });
  });
});
