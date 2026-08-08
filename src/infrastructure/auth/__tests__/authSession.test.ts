/**
 * AuthSession seam (Slice 12) — the sign-out port + reactive availability that
 * ClerkTokenBridge feeds and AccountSection consumes via useSyncExternalStore.
 * Locks: availability flips on active/inactive TRANSITIONS only, subscribers are
 * notified, and getAuthSession().signOut() resolves the current seam value (safe
 * no-op in dev-bypass).
 */
import {
  getAuthSession,
  isAuthSessionActive,
  setSessionSignOut,
  subscribeAuthSession,
} from "../authSession";

afterEach(() => {
  setSessionSignOut(null);
});

describe("session availability", () => {
  it("is inactive with no registered sign-out (dev-bypass)", () => {
    expect(isAuthSessionActive()).toBe(false);
  });

  it("notifies subscribers only on an active/inactive transition", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAuthSession(listener);

    setSessionSignOut(async () => {});
    expect(isAuthSessionActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Re-registering another getter while already active is NOT a transition.
    setSessionSignOut(async () => {});
    expect(listener).toHaveBeenCalledTimes(1);

    setSessionSignOut(null);
    expect(isAuthSessionActive()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSessionSignOut(async () => {});
    expect(listener).toHaveBeenCalledTimes(2); // no longer notified
  });
});

describe("getAuthSession().signOut", () => {
  it("resolves the registered sign-out", async () => {
    const signOut = jest.fn(async () => {});
    setSessionSignOut(signOut);

    await getAuthSession().signOut();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("is a safe no-op when no session is registered", async () => {
    await expect(getAuthSession().signOut()).resolves.toBeUndefined();
  });
});
