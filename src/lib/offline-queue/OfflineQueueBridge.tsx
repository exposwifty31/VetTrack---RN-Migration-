import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { resolveAuthSnapshot, subscribeAuthChange, type AuthChange } from "@/lib/auth-fetch";

import { replayOfflineQueue, type ReplayAuthSnapshot, type ReplayDeps } from "./offline-queue";

type ReplayFn = (deps?: ReplayDeps) => Promise<void>;
type AuthChangeSubscribe = (listener: (change: AuthChange) => void) => () => void;
type ResolveAuthSnapshotFn = () => Promise<ReplayAuthSnapshot | null>;

/**
 * Diagnostic record of the last time a triggered replay pass rejected (e.g.
 * `resolveAuthSnapshot` itself throwing). This repo has no Sentry/telemetry
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
 *   - Auth "changed" (account switch)→ replay() IF still `active` (a fresh
 *                                       ATOMIC {userId, token} snapshot is
 *                                       resolved per item during replay —
 *                                       see offline-queue.ts's ownership
 *                                       gate)
 *   - Auth "cleared" (sign-out)      → no replay (no valid token to attach)
 *
 * `resolveAuthSnapshot` (from `auth-fetch.ts`) is threaded into every replay
 * call — CodeRabbit PR #51's CRITICAL re-review fix. A round-1 version of
 * this bridge passed a pass-level `resolveToken` and a separately-read
 * `getCurrentUserId` as two independent dependencies; that let an account
 * switch straddle the two reads and pair one identity's token with a
 * DIFFERENT identity's queued write. `resolveAuthSnapshot` returns both
 * fields as ONE atomic unit (or `null`), so there is no seam left to
 * straddle — see its doc in auth-fetch.ts for the revision-counter
 * mechanism that makes the snapshot itself trustworthy.
 *
 * Headless component mounted at App level, sibling to RealtimeBridge.
 */
export function OfflineQueueBridge({
  replay = replayOfflineQueue as ReplayFn,
  resolveAuthSnapshot: resolveSnapshot = resolveAuthSnapshot as ResolveAuthSnapshotFn,
  onAuthChange = subscribeAuthChange,
}: {
  replay?: ReplayFn;
  resolveAuthSnapshot?: ResolveAuthSnapshotFn;
  onAuthChange?: AuthChangeSubscribe;
}) {
  useEffect(() => {
    const triggerReplay = () => {
      // Never let a rejection (e.g. resolveAuthSnapshot throwing) escape as
      // an unhandled rejection at this lifecycle boundary — CodeRabbit PR #51.
      replay({ resolveAuthSnapshot: resolveSnapshot }).catch(reportReplayRejection);
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
  }, [replay, resolveSnapshot, onAuthChange]);

  return null;
}
