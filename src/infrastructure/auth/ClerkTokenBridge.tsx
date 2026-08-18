import { useAuth } from "@clerk/expo";
import { useEffect } from "react";

import { setClerkTokenGetter } from "@/lib/auth-fetch";
import { setSessionSignOut } from "@/infrastructure/auth/authSession";

/**
 * Wires Clerk into the framework-free seams (mirrors use-auth.tsx): `getToken`
 * into auth-fetch, and `signOut` into the AuthSessionPort seam so UI code signs
 * out through the port without importing Clerk. Must render under ClerkProvider.
 * Resets both on sign-out / unmount.
 */
export function ClerkTokenBridge() {
  const { isSignedIn, getToken, signOut } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setClerkTokenGetter(null);
      setSessionSignOut(null);
      return;
    }
    setClerkTokenGetter(async () => {
      const token = await getToken();
      return typeof token === "string" ? token : null;
    });
    setSessionSignOut(async () => {
      await signOut();
    });
    return () => {
      setClerkTokenGetter(null);
      setSessionSignOut(null);
    };
  }, [isSignedIn, getToken, signOut]);

  return null;
}
