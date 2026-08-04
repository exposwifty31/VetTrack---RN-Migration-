import { useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";

import { setClerkTokenGetter } from "@/lib/auth-fetch";

/**
 * Wires Clerk `getToken` into the auth-fetch seam (mirrors use-auth.tsx).
 * Must render under ClerkProvider. Resets the getter on sign-out / unmount.
 */
export function ClerkTokenBridge() {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setClerkTokenGetter(null);
      return;
    }
    setClerkTokenGetter(async () => {
      const token = await getToken();
      return typeof token === "string" ? token : null;
    });
    return () => {
      setClerkTokenGetter(null);
    };
  }, [isSignedIn, getToken]);

  return null;
}
