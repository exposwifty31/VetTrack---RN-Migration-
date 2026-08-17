import { useSyncExternalStore } from "react";

import {
  getOfflineQueueSnapshot,
  subscribeOfflineQueueEvent,
  type OfflineQueueEvent,
} from "./offline-queue";

/**
 * W3a offline-queue failure UI — derived, read-only status the banner renders.
 *
 * The queue (offline-queue.ts) emits lifecycle events but nothing consumed the
 * two that matter to the user: `item_permanent_failure` (a write was dropped
 * after exhausting retries) and `circuit_open` (replay paused). This module
 * folds those events, plus the live pending count, into a small status object.
 *
 * `pending` always reflects the queue's actual length (source of truth) rather
 * than an event tally, so it can never drift; the flags are sticky until the
 * queue drains cleanly (a successful pass with nothing left).
 */
export type OfflineQueueStatus = {
  pending: number;
  circuitOpenUntil: number | null;
  lastPermanentFailureAt: number | null;
};

export const INITIAL_OFFLINE_QUEUE_STATUS: OfflineQueueStatus = {
  pending: 0,
  circuitOpenUntil: null,
  lastPermanentFailureAt: null,
};

export type OfflineQueueStatusCtx = { pending: number; now: number };

/** Pure fold — given the prior status, an event, and the live pending count/clock. */
export function nextOfflineQueueStatus(
  prev: OfflineQueueStatus,
  event: OfflineQueueEvent,
  ctx: OfflineQueueStatusCtx,
): OfflineQueueStatus {
  const pending = ctx.pending;
  switch (event.kind) {
    case "circuit_open":
      return { ...prev, pending, circuitOpenUntil: event.until };
    case "item_permanent_failure":
      return { ...prev, pending, lastPermanentFailureAt: ctx.now };
    case "item_success":
    case "replay_end":
      // A drained queue makes any earlier pause / dropped-write stale.
      if (pending === 0) {
        return { pending: 0, circuitOpenUntil: null, lastPermanentFailureAt: null };
      }
      return { ...prev, pending };
    case "enqueued":
    case "replay_start":
    case "item_retry":
    case "item_owner_mismatch":
      return { ...prev, pending };
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { ...prev, pending };
    }
  }
}

let status: OfflineQueueStatus = INITIAL_OFFLINE_QUEUE_STATUS;
const storeListeners = new Set<() => void>();
let queueUnsub: (() => void) | null = null;

function safePending(): number {
  try {
    return getOfflineQueueSnapshot().length;
  } catch {
    return status.pending;
  }
}

function ensureStarted(): void {
  if (queueUnsub) return;
  status = { ...INITIAL_OFFLINE_QUEUE_STATUS, pending: safePending() };
  queueUnsub = subscribeOfflineQueueEvent((event) => {
    status = nextOfflineQueueStatus(status, event, { pending: safePending(), now: Date.now() });
    for (const listener of storeListeners) listener();
  });
}

function subscribe(callback: () => void): () => void {
  ensureStarted();
  storeListeners.add(callback);
  return () => {
    storeListeners.delete(callback);
  };
}

function getSnapshot(): OfflineQueueStatus {
  return status;
}

/** Live offline-queue status for banners/toasts. Subscribes lazily on first use. */
export function useOfflineQueueStatus(): OfflineQueueStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only — detach the queue subscription and reset the derived status. */
export function _resetOfflineQueueStatusForTests(): void {
  queueUnsub?.();
  queueUnsub = null;
  status = INITIAL_OFFLINE_QUEUE_STATUS;
  storeListeners.clear();
}
