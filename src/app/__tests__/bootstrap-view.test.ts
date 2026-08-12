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
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false });
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
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: false });
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
    ).toEqual({ kind: "reauth", canSignIn: true, canReauth: false });
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
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: true });
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
    ).toEqual({ kind: "reauth", canSignIn: false, canReauth: false });
  });
});
