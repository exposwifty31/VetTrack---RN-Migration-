/**
 * W3a offline-queue failure UI: the queue emitted `item_permanent_failure` and
 * `circuit_open` into the void — no surface told the user a write was dropped or
 * that replay had paused. This pins the pure status reducer that derives the
 * banner state from those events plus the live pending count.
 */
import type { PendingSync } from "@vettrack/contracts";

import {
  INITIAL_OFFLINE_QUEUE_STATUS,
  nextOfflineQueueStatus,
} from "../offline-queue-status";
import type { OfflineQueueEvent } from "../offline-queue";

const item = { clientMutationId: "m1" } as unknown as PendingSync;

describe("nextOfflineQueueStatus", () => {
  const ctx = (pending: number, now = 1_000) => ({ pending, now });

  it("reflects the live pending count on enqueue", () => {
    const next = nextOfflineQueueStatus(
      INITIAL_OFFLINE_QUEUE_STATUS,
      { kind: "enqueued", item } satisfies OfflineQueueEvent,
      ctx(2),
    );
    expect(next.pending).toBe(2);
    expect(next.circuitOpenUntil).toBeNull();
    expect(next.lastPermanentFailureAt).toBeNull();
  });

  it("records the circuit-open deadline", () => {
    const next = nextOfflineQueueStatus(
      INITIAL_OFFLINE_QUEUE_STATUS,
      { kind: "circuit_open", until: 5_000 },
      ctx(3),
    );
    expect(next.circuitOpenUntil).toBe(5_000);
    expect(next.pending).toBe(3);
  });

  it("stamps a permanent failure with the current time", () => {
    const next = nextOfflineQueueStatus(
      INITIAL_OFFLINE_QUEUE_STATUS,
      { kind: "item_permanent_failure", item },
      ctx(1, 4_242),
    );
    expect(next.lastPermanentFailureAt).toBe(4_242);
    expect(next.pending).toBe(1);
  });

  it("clears stale flags once the queue drains cleanly", () => {
    const dirty = {
      pending: 1,
      circuitOpenUntil: 5_000,
      lastPermanentFailureAt: 4_242,
    };
    const next = nextOfflineQueueStatus(dirty, { kind: "replay_end" }, ctx(0));
    expect(next.pending).toBe(0);
    expect(next.circuitOpenUntil).toBeNull();
    expect(next.lastPermanentFailureAt).toBeNull();
  });

  it("keeps flags while items remain after a replay pass", () => {
    const dirty = {
      pending: 2,
      circuitOpenUntil: 5_000,
      lastPermanentFailureAt: 4_242,
    };
    const next = nextOfflineQueueStatus(dirty, { kind: "replay_end" }, ctx(2));
    expect(next.circuitOpenUntil).toBe(5_000);
    expect(next.lastPermanentFailureAt).toBe(4_242);
  });
});
