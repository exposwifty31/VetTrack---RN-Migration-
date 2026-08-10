import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { resolveBearerToken, subscribeAuthChange, type AuthChange } from "@/lib/auth-fetch";
import { getCurrentUserId as getCurrentUserIdFromStore } from "@/lib/auth-store";

import { replayOfflineQueue, type ReplayDeps } from "./offline-queue";

type ReplayFn = (deps?: ReplayDeps) => Promise<void>;
type AuthChangeSubscribe = (listener: (change: AuthChange) => void) => () => void;

/**
 * Diagnostic record of the last time a triggered replay pass rejected (e.g.
 * `resolveToken` itself throwing). This repo has no Sentry/telemetry
 * backend wired yet (verified: no `@sentry/*` dependency), so this mirrors
 * `emergency-block.ts`'s local-buffer precedent rather than inventing a
 * telemetry call that doesn't exist — CodeRabbit PR #51 flagged the
 * rejection as unhandled; the fix is "don't let it crash the lifecycle
 * boundary AND make it observable", not "ship a fake analytics call".
 */
export type ReplayRejection = { message: string; ts: number };
let lastReplayRejection: ReplayRejection | null = null;

export function getLastOfflineQueueReplayRejection(): ReplayRejection | null {
  return lastReplayRejection;
}

/** Test-only — reset the module-lifetime diagnostic between cases. */
export function _clearLastOfflineQueueReplayRejectionForTests(): void {
  lastReplayRejection = null;
}

function reportReplayRejection(err: unknown): void {
  lastReplayRejection = {
    message: err instanceof Error ? err.message : String(err),
    ts: Date.now(),
  };
}

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
 *                                       AND new identity are fetched fresh via
 *                                       resolveToken / getCurrentUserId — see
 *                                       offline-queue.ts's per-item ownership
 *                                       gate, the CodeRabbit PR #51 fix)
 *   - Auth "cleared" (sign-out)      → no replay (no valid token to attach)
 *
 * `getCurrentUserId` is threaded into every replay call so the queue can
 * refuse to replay a write under the wrong identity on a shared device —
 * see `replayOfflineQueue`'s ownership-gate doc in offline-queue.ts.
 *
 * Headless component mounted at App level, sibling to RealtimeBridge.
 */
export function OfflineQueueBridge({
  replay = replayOfflineQueue as ReplayFn,
  resolveToken = resolveBearerToken,
  getCurrentUserId = getCurrentUserIdFromStore,
  onAuthChange = subscribeAuthChange,
}: {
  replay?: ReplayFn;
  resolveToken?: () => Promise<string | null>;
  getCurrentUserId?: () => string | null;
  onAuthChange?: AuthChangeSubscribe;
}) {
  useEffect(() => {
    const triggerReplay = () => {
      // Never let a rejection (e.g. resolveToken throwing) escape as an
      // unhandled rejection at this lifecycle boundary — CodeRabbit PR #51.
      replay({ resolveToken, getCurrentUserId }).catch(reportReplayRejection);
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
  }, [replay, resolveToken, getCurrentUserId, onAuthChange]);

  return null;
}
