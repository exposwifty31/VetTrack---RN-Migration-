import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { RealtimePort } from "@/core/ports/realtime.port";

import { getDefaultRealtimePort } from "./defaultRealtime";

/**
 * Foreground-only lifecycle for the realtime stream (SCAFFOLD-PLAN slice 5, #14/#18).
 * Mirrors ClerkTokenBridge: a headless component mounted at App level.
 *
 *   - App becomes `active`         → port.open()  (replays from the retained cursor)
 *   - App goes background/inactive  → port.close()
 *
 * Clerk-free by design: the adapter resolves a FRESH Bearer via the slice-4 token
 * seam at open() time, so this works under ClerkProvider OR the dev-bearer path
 * (user/Clerk streams are auth'd at connect only — startDisplayRevocationWatch
 * no-ops for them — so token staleness during a long foreground session won't drop
 * the stream).
 *
 * COLD-START ERROR FLASH IS EXPECTED, NOT A FAILURE (verdict note):
 *   - Signed OUT: on cold start the app is `active`, this effect calls open(), the
 *     resolved token is invalid → benign state='error' until the next foreground
 *     transition after sign-in.
 *   - Signed IN: this bridge mounts as a sibling ABOVE NavigationContainer, so its
 *     mount effect can call open() BEFORE ClerkTokenBridge's effect wires
 *     setClerkTokenGetter. resolveBearerToken() then falls through to a (usually
 *     empty) stored bearer → invalid → a transient state='error' even with a valid
 *     Clerk session. This is OFF the proof path: the empirical KEEPALIVE gate uses
 *     the debug screen's manual Connect AFTER sign-in, by which point the getter is
 *     wired. A self-healing session-change signal (Clerk isSignedIn → adapter) is a
 *     deliberately deferred follow-up (see openQuestions in the slice spec).
 */
export function RealtimeBridge({ port = getDefaultRealtimePort() }: { port?: RealtimePort }) {
  useEffect(() => {
    if (AppState.currentState === "active") {
      port.open();
    }
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        port.open();
      } else {
        port.close();
      }
    });
    return () => {
      sub.remove();
      port.close();
    };
  }, [port]);

  return null;
}
