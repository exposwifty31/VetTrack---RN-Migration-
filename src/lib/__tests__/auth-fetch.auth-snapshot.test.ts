/**
 * G4-6 — CodeRabbit PR #51 CRITICAL re-review finding: `resolveAuthSnapshot`
 * must bind {userId, token} to ONE atomic identity generation. The round-1
 * fix checked `current.userId` per replay item but still combined it with a
 * pass-level token resolved separately — a TOCTOU window where an account
 * switch DURING token resolution pairs one identity's token with a
 * different identity's userId (or write).
 *
 * These are the airtight proof: they exercise the atomicity mechanism
 * itself (the revision-counter check), not a stand-in that merely returns
 * null. A regression here is exactly the bug that shipped a second time.
 */
import { resolveAuthSnapshot, setClerkTokenGetter } from "../auth-fetch";
import {
  _resetAuthStoreForTests,
  getIdentityRevision,
  setCurrentUserId,
  setStoredBearerToken,
} from "../auth-store";

afterEach(() => {
  setClerkTokenGetter(null);
  _resetAuthStoreForTests();
});

describe("resolveAuthSnapshot — atomic identity+token binding", () => {
  it("returns a consistent {userId, token} snapshot when nothing changes during resolution", async () => {
    setCurrentUserId("user_1");
    setClerkTokenGetter(async () => "token-a");

    const snapshot = await resolveAuthSnapshot();

    expect(snapshot).toMatchObject({ userId: "user_1", token: "token-a" });
  });

  it("CRITICAL: returns null when the identity changes WHILE the token is being resolved (TOCTOU window)", async () => {
    setCurrentUserId("user_1");
    setClerkTokenGetter(async () => {
      // Simulates an account switch landing while Clerk's getToken() is
      // in flight (e.g. a keychain/network read) — the exact race
      // CodeRabbit flagged. This token belongs to a DIFFERENT identity
      // generation than the userId captured before this await started.
      setCurrentUserId("user_2");
      return "token-for-user-2";
    });

    const snapshot = await resolveAuthSnapshot();

    // Must NEVER pair the captured "user_1" with "token-for-user-2" — nor
    // silently re-read and return "user_2" paired with its own token,
    // which would equally hide the fact that the CALLER'S in-flight
    // operation (e.g. enqueueing a write) started under a different
    // identity than the one now current.
    expect(snapshot).toBeNull();
  });

  it("returns null when signed out entirely DURING token resolution", async () => {
    setCurrentUserId("user_1");
    setClerkTokenGetter(async () => {
      setClerkTokenGetter(null); // sign-out mid-resolution
      return "stale-token";
    });

    const snapshot = await resolveAuthSnapshot();

    expect(snapshot).toBeNull();
  });

  it("falls back to the stored bearer token (no Clerk getter) and still snapshots userId consistently", async () => {
    setCurrentUserId("user_1");
    setStoredBearerToken("dev.bearer.token");

    const snapshot = await resolveAuthSnapshot();

    expect(snapshot).toMatchObject({ userId: "user_1", token: "dev.bearer.token" });
  });

  it("a stable identity across MULTIPLE snapshot calls yields the same revision", async () => {
    setCurrentUserId("user_1");
    setClerkTokenGetter(async () => "token-a");

    const first = await resolveAuthSnapshot();
    const second = await resolveAuthSnapshot();

    expect(first?.revision).toBe(second?.revision);
  });
});

describe("identity revision bumping", () => {
  it("setClerkTokenGetter bumps the revision on every real transition (ready/changed/cleared)", () => {
    const before = getIdentityRevision();

    setClerkTokenGetter(async () => "a"); // ready
    const afterReady = getIdentityRevision();
    expect(afterReady).toBeGreaterThan(before);

    setClerkTokenGetter(async () => "b"); // changed (different getter)
    const afterChanged = getIdentityRevision();
    expect(afterChanged).toBeGreaterThan(afterReady);

    setClerkTokenGetter(null); // cleared
    expect(getIdentityRevision()).toBeGreaterThan(afterChanged);
  });

  it("setClerkTokenGetter does NOT bump on a no-op re-set (same getter reference)", () => {
    const getter = async () => "a";
    setClerkTokenGetter(getter);
    const after = getIdentityRevision();

    setClerkTokenGetter(getter); // identical reference — no transition

    expect(getIdentityRevision()).toBe(after);
  });

  it("setCurrentUserId bumps the revision independently of the Clerk getter (dev-bypass / useIdentity path)", () => {
    const before = getIdentityRevision();
    setCurrentUserId("user_1");
    expect(getIdentityRevision()).toBeGreaterThan(before);
  });
});
