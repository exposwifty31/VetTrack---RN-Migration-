import { useAuth } from "@clerk/expo";
import { useEffect, useRef } from "react";

import { setClerkTokenGetter } from "@/lib/auth-fetch";
import { setSessionSignOut } from "@/infrastructure/auth/authSession";
import { setClerkAuthState } from "@/infrastructure/auth/clerk-auth-state";

/**
 * Wires Clerk into the framework-free seams (mirrors use-auth.tsx): `getToken`
 * into auth-fetch, and `signOut` into the AuthSessionPort seam so UI code signs
 * out through the port without importing Clerk. Must render under ClerkProvider.
 * Resets both on sign-out / unmount.
 *
 * Also publishes `{ isLoaded, isSignedIn }` to the clerk-auth-state seam, which
 * is how `RootNavigator` picks the auth stack vs the app stack without calling
 * `useAuth()` itself (that hook throws on the no-key build, where ClerkProvider
 * never mounts). `isLoaded` matters: without it the navigator cannot tell
 * "signed out" from "not restored yet" and flashes SignIn over a session
 * SecureStore is about to return.
 */
export function ClerkTokenBridge() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();

  /**
   * `@clerk/expo` v4's `useAuth` hands back a NEW `getToken` on every render — it
   * wraps `@clerk/react`'s useCallback-memoised one in a bare arrow function with
   * no memoisation of its own. Keying the install effect on it reinstalled the
   * seam every render, and each reinstall is a cleared->ready pair that makes
   * RealtimeBridge close and reopen the SSE stream. Routing the live functions
   * through refs lets the effect key on the identity instead; the installed
   * closures read `.current` when invoked, so they never go stale.
   */
  const liveGetToken = useRef(getToken);
  const liveSignOut = useRef(signOut);
  useEffect(() => {
    liveGetToken.current = getToken;
    liveSignOut.current = signOut;
  });

  // Publishes to the clerk-auth-state seam. Keyed on the two BOOLEANS, not on
  // any Clerk callback, so it inherits none of the render-identity churn the
  // refs above exist to absorb.
  useEffect(() => {
    setClerkAuthState({ isLoaded: !!isLoaded, isSignedIn: !!isSignedIn });
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) {
      setClerkTokenGetter(null);
      setSessionSignOut(null);
      return;
    }
    setClerkTokenGetter(async () => {
      const token = await liveGetToken.current();
      return typeof token === "string" ? token : null;
    });
    setSessionSignOut(async () => {
      await liveSignOut.current();
    });
    return () => {
      setClerkTokenGetter(null);
      setSessionSignOut(null);
    };
  }, [isSignedIn, userId]);

  return null;
}
