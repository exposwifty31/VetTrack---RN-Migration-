import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { resolveBearerToken, subscribeAuthChange, type AuthChange } from "@/lib/auth-fetch";

import { replayOfflineQueue, type ReplayDeps } from "./offline-queue";

type ReplayFn = (deps?: ReplayDeps) => Promise<void>;
type AuthChangeSubscribe = (listener: (change: AuthChange) => void) => () => void;

/**
 * Foreground/reconnect-only lifecycle for the offline write-queue (G4-6).
 * Mirrors RealtimeBridge exactly, on purpose: RN has no `window` `online`
 * event, so AppState foreground + the same auth-identity signal the
 * realtime stream already uses ARE the canonical "back online" proxies on
 * this platform. No polling — replay only fires on these transitions:
 *
 *   - App becomes `active`           → replay() (attempts every pending write)
 *   - Auth "ready" (sign-in)         → replay() again IF still `active`
 *   - Auth "changed" (account switch)→ replay() IF still `active` (new Bearer
 *                                       is fetched fresh via resolveToken)
 *   - Auth "cleared" (sign-out)      → no replay (no valid token to attach)
 *
 * Headless component mounted at App level, sibling to RealtimeBridge.
 */
export function OfflineQueueBridge({
  replay = replayOfflineQueue as ReplayFn,
  resolveToken = resolveBearerToken,
  onAuthChange = subscribeAuthChange,
}: {
  replay?: ReplayFn;
  resolveToken?: () => Promise<string | null>;
  onAuthChange?: AuthChangeSubscribe;
}) {
  useEffect(() => {
    const triggerReplay = () => {
      void replay({ resolveToken });
    };

    if (AppState.currentState === "active") {
      triggerReplay();
    }
    const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        triggerReplay();
      }
    });
    const unsubscribeAuthChange = onAuthChange((change: AuthChange) => {
      if (change === "cleared") return; // no valid token — nothing to replay with
      if (AppState.currentState === "active") {
        triggerReplay();
      }
    });
    return () => {
      appStateSub.remove();
      unsubscribeAuthChange();
    };
  }, [replay, resolveToken, onAuthChange]);

  return null;
}
