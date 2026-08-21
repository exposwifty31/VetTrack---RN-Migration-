import { useAuth } from "@clerk/expo";
import { useEffect, useRef } from "react";

import { setClerkTokenGetter } from "@/lib/auth-fetch";
import { setSessionSignOut } from "@/infrastructure/auth/authSession";

/**
 * Wires Clerk into the framework-free seams (mirrors use-auth.tsx): `getToken`
 * into auth-fetch, and `signOut` into the AuthSessionPort seam so UI code signs
 * out through the port without importing Clerk. Must render under ClerkProvider.
 * Resets both on sign-out / unmount.
 */
export function ClerkTokenBridge() {
  const { isSignedIn, userId, getToken, signOut } = useAuth();

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
