import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { RealtimePort } from "@/core/ports/realtime.port";
import { subscribeAuthReady } from "@/lib/auth-fetch";

import { getDefaultRealtimePort } from "./defaultRealtime";

type AuthReadySubscribe = (listener: () => void) => () => void;

/**
 * Foreground-only lifecycle for the realtime stream (SCAFFOLD-PLAN slice 5, #14/#18).
 * Mirrors ClerkTokenBridge: a headless component mounted at App level.
 *
 *   - App becomes `active`         → port.open()  (replays from the retained cursor)
 *   - App goes background/inactive  → port.close()
 *   - Auth becomes ready (sign-in)  → port.open() again IF still `active`
 *
 * Clerk-free by design: the adapter resolves a FRESH Bearer via the slice-4 token
 * seam at open() time, so this works under ClerkProvider OR the dev-bearer path
 * (user/Clerk streams are auth'd at connect only — startDisplayRevocationWatch
 * no-ops for them — so token staleness during a long foreground session won't drop
 * the stream).
 *
 * COLD-START ERROR FLASH IS TRANSIENT AND SELF-HEALING (verdict note):
 *   - Signed OUT: on cold start the app is `active`, this effect calls open(), the
 *     resolved token is invalid → benign state='error' until sign-in fires the
 *     auth-ready signal below (or the next foreground transition).
 *   - Signed IN: this bridge mounts as a sibling ABOVE NavigationContainer, so its
 *     mount effect can call open() BEFORE ClerkTokenBridge's effect wires
 *     setClerkTokenGetter. resolveBearerToken() then falls through to a (usually
 *     empty) stored bearer → invalid → a transient state='error'. It self-heals:
 *     when ClerkTokenBridge installs the getter, setClerkTokenGetter fires the
 *     auth-ready signal and this effect re-opens the stream while still `active` —
 *     no background→foreground transition required. open() is idempotent (guards
 *     on connecting/open), so a redundant fire is a no-op.
 */
export function RealtimeBridge({
  port = getDefaultRealtimePort(),
  onAuthReady = subscribeAuthReady,
}: {
  port?: RealtimePort;
  onAuthReady?: AuthReadySubscribe;
}) {
  useEffect(() => {
    if (AppState.currentState === "active") {
      port.open();
    }
    const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        port.open();
      } else {
        port.close();
      }
    });
    // Sign-in while the app is already active must re-open the stream that opened
    // (and failed) before a valid token existed.
    const unsubscribeAuthReady = onAuthReady(() => {
      if (AppState.currentState === "active") {
        port.open();
      }
    });
    return () => {
      appStateSub.remove();
      unsubscribeAuthReady();
      port.close();
    };
  }, [port, onAuthReady]);

  return null;
}
