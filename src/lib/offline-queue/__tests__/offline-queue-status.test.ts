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
    // "Cleanly" means a write SUCCEEDED and left nothing behind. Only
    // `item_success` carries that; see the case below for why `replay_end` does
    // not.
    const dirty = {
      pending: 1,
      circuitOpenUntil: 5_000,
      lastPermanentFailureAt: 4_242,
    };
    const next = nextOfflineQueueStatus(dirty, { kind: "item_success", item }, ctx(0));
    expect(next.pending).toBe(0);
    expect(next.circuitOpenUntil).toBeNull();
    expect(next.lastPermanentFailureAt).toBeNull();
  });

  it("does NOT clear a dropped write just because the replay pass ended", () => {
    // The queue reaching zero is not proof of success — a permanent failure
    // REMOVES the item, so the very next `replay_end` sees an empty queue. An
    // earlier version treated the two as one case, which meant the one event
    // sequence that matters most (last write dropped -> pass ends) erased the
    // banner before the user could read it. Silent data loss, reported as calm.
    const afterDrop = {
      pending: 0,
      circuitOpenUntil: 5_000,
      lastPermanentFailureAt: 4_242,
    };
    const next = nextOfflineQueueStatus(afterDrop, { kind: "replay_end" }, ctx(0));
    expect(next.lastPermanentFailureAt).toBe(4_242);
    expect(next.circuitOpenUntil).toBe(5_000);
  });

  it("surfaces a permanent failure that empties the queue, through the following replay_end", () => {
    // The same thing end to end, driven as the queue really emits it.
    const dropped = nextOfflineQueueStatus(
      { pending: 1, circuitOpenUntil: null, lastPermanentFailureAt: null },
      { kind: "item_permanent_failure", item },
      ctx(0),
    );
    expect(dropped.lastPermanentFailureAt).not.toBeNull();

    const settled = nextOfflineQueueStatus(dropped, { kind: "replay_end" }, ctx(0));
    expect(settled.lastPermanentFailureAt).toBe(dropped.lastPermanentFailureAt);
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
