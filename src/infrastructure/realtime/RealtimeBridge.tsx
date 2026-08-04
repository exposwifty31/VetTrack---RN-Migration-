import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { RealtimePort } from "@/core/ports/realtime.port";
import { type AuthChange, subscribeAuthChange } from "@/lib/auth-fetch";

import { getDefaultRealtimePort } from "./defaultRealtime";

type AuthChangeSubscribe = (listener: (change: AuthChange) => void) => () => void;

/**
 * Foreground-only lifecycle for the realtime stream (SCAFFOLD-PLAN slice 5, #14/#18).
 * Mirrors ClerkTokenBridge: a headless component mounted at App level.
 *
 *   - App becomes `active`          → port.open()  (replays from the retained cursor)
 *   - App goes background/inactive   → port.close()
 *   - Auth "ready" (sign-in)         → port.open() again IF still `active`
 *   - Auth "changed" (account switch)→ port.close() then port.open() IF `active`
 *   - Auth "cleared" (sign-out)      → port.close() (never stream with a stale token)
 *
 * Clerk-free by design: the adapter resolves a FRESH Bearer via the slice-4 token
 * seam at open() time, so this works under ClerkProvider OR the dev-bearer path
 * (user/Clerk streams are auth'd at connect only — startDisplayRevocationWatch
 * no-ops for them — so token staleness during a long foreground session won't drop
 * the stream).
 *
 * WHY account-switch/sign-out need an explicit close (CWE-613): SseAdapter.open()
 * is a no-op while the connection is already `open`/`connecting`, so it will NOT
 * swap the Bearer on its own. Closing first tears the EventSource down and drops
 * the adapter out of the open-guard, so the following open() re-resolves the NEW
 * token. On sign-out we close and stay closed — the old token must stop streaming.
 *
 * COLD-START ERROR FLASH IS TRANSIENT AND SELF-HEALING (verdict note):
 *   - Signed OUT: on cold start the app is `active`, this effect calls open(), the
 *     resolved token is invalid → benign state='error' until sign-in fires the
 *     auth "ready" signal below (or the next foreground transition).
 *   - Signed IN: this bridge mounts as a sibling ABOVE NavigationContainer, so its
 *     mount effect can call open() BEFORE ClerkTokenBridge's effect wires
 *     setClerkTokenGetter. resolveBearerToken() then falls through to a (usually
 *     empty) stored bearer → invalid → a transient state='error'. It self-heals:
 *     when ClerkTokenBridge installs the getter, setClerkTokenGetter fires the
 *     auth "ready" signal and this effect re-opens the stream while still `active` —
 *     no background→foreground transition required. open() is idempotent (guards
 *     on connecting/open), so a redundant fire is a no-op.
 */
export function RealtimeBridge({
  port = getDefaultRealtimePort(),
  onAuthChange = subscribeAuthChange,
}: {
  port?: RealtimePort;
  onAuthChange?: AuthChangeSubscribe;
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
    const unsubscribeAuthChange = onAuthChange((change: AuthChange) => {
      if (change === "cleared") {
        // Sign-out: stop streaming — the previous Bearer is no longer valid.
        port.close();
        return;
      }
      // Account switch: close first so the adapter drops the old EventSource and
      // the following open() reconnects with the NEW Bearer (open() alone no-ops
      // on an already-open stream and would keep the previous token).
      if (change === "changed") {
        port.close();
      }
      // "ready" (sign-in) or "changed" (account switch): (re)open while foregrounded.
      if (AppState.currentState === "active") {
        port.open();
      }
    });
    return () => {
      appStateSub.remove();
      unsubscribeAuthChange();
      port.close();
    };
  }, [port, onAuthChange]);

  return null;
}
