/**
 * Pure sweep-derivation tests (Slice 7). The load-bearing contract: the commit
 * payload carries confirmed RESTING ids only — a checked-out item toggled
 * "present" must never appear (D-9). Also locks bucket tones, the partition,
 * the summary tallies, and the last-swept relative-time buckets.
 */
import { DAY_MS } from "@/lib/home-readiness";
import type { ReconciliationBucket, SweepItem } from "@/lib/api/docking";

import {
  buildSweepCommitPayload,
  deriveRoomSweptState,
  isSweepable,
  partitionSweepItems,
  sweepBucketLabelKey,
  sweepBucketTone,
  sweepSummary,
} from "../rooms-derive";

// rooms-derive → @/lib/datetime → @/i18n → safe-storage hits the MMKV native
// module, absent under jest — mock the helpers (the datetime.test.ts pattern).
// deriveRoomSweptState passes nowMs explicitly, so persisted locale is moot.
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

function makeItem(over: Partial<SweepItem> & { id: string }): SweepItem {
  return {
    name: `item-${over.id}`,
    assetTypeId: "cat-1",
    custodyState: "resting",
    checkedOutById: null,
    checkedOutByEmail: null,
    checkedOutAt: null,
    homeDockId: "dock-1",
    homeDockName: "Dock 1",
    atStation: true,
    bucket: "at_home",
    ...over,
  };
}

describe("sweepBucketTone", () => {
  it("maps every bucket to a semantic tone (missing = danger, at_home = success)", () => {
    const cases: [ReconciliationBucket, ReturnType<typeof sweepBucketTone>][] = [
      ["at_home", "success"],
      ["checked_out", "info"],
      ["returned_unverified", "warning"],
      ["returned_away", "warning"],
      ["misplaced_at_station", "warning"],
      ["missing", "danger"],
      ["no_station", "stale"],
      ["unassigned", "neutral"],
    ];
    for (const [bucket, tone] of cases) {
      expect(sweepBucketTone(bucket)).toBe(tone);
    }
  });
});

describe("sweepBucketLabelKey", () => {
  it("returns the namespaced i18n key for each bucket", () => {
    expect(sweepBucketLabelKey("at_home")).toBe("roomDetail.bucket.atHome");
    expect(sweepBucketLabelKey("missing")).toBe("roomDetail.bucket.missing");
    expect(sweepBucketLabelKey("no_station")).toBe("roomDetail.bucket.noStation");
  });
});

describe("isSweepable / partitionSweepItems", () => {
  it("treats an item with a holder as accounted (not sweepable)", () => {
    expect(isSweepable(makeItem({ id: "a" }))).toBe(true);
    expect(isSweepable(makeItem({ id: "b", checkedOutById: "user-1" }))).toBe(false);
  });

  it("splits resting vs checked-out, preserving order", () => {
    const items = [
      makeItem({ id: "r1" }),
      makeItem({ id: "c1", checkedOutById: "user-1", bucket: "checked_out" }),
      makeItem({ id: "r2" }),
    ];
    const { sweepable, accounted } = partitionSweepItems(items);
    expect(sweepable.map((i) => i.id)).toEqual(["r1", "r2"]);
    expect(accounted.map((i) => i.id)).toEqual(["c1"]);
  });
});

describe("buildSweepCommitPayload", () => {
  const items = [
    makeItem({ id: "r1" }),
    makeItem({ id: "r2" }),
    makeItem({ id: "c1", checkedOutById: "user-1", bucket: "checked_out" }),
  ];

  it("sends only confirmed RESTING ids", () => {
    const confirmed = new Set(["r1"]);
    expect(buildSweepCommitPayload(items, confirmed)).toEqual(["r1"]);
  });

  it("NEVER includes a checked-out id even when it is confirmed (D-9)", () => {
    const confirmed = new Set(["r1", "c1"]);
    expect(buildSweepCommitPayload(items, confirmed)).toEqual(["r1"]);
  });

  it("is empty when nothing resting is confirmed", () => {
    expect(buildSweepCommitPayload(items, new Set(["c1"]))).toEqual([]);
    expect(buildSweepCommitPayload(items, new Set())).toEqual([]);
  });
});

describe("sweepSummary", () => {
  it("tallies present/missing over the sweepable set only", () => {
    const items = [
      makeItem({ id: "r1" }),
      makeItem({ id: "r2" }),
      makeItem({ id: "r3" }),
      makeItem({ id: "c1", checkedOutById: "user-1" }),
    ];
    const summary = sweepSummary(items, new Set(["r1"]));
    // total counts resting only (3), not the checked-out item.
    expect(summary).toEqual({ total: 3, present: 1, missing: 2 });
  });
});

describe("deriveRoomSweptState", () => {
  const now = Date.UTC(2026, 7, 8, 12, 0, 0);

  it("returns never for a null timestamp", () => {
    expect(deriveRoomSweptState(null, now)).toEqual({ kind: "never" });
    expect(deriveRoomSweptState(undefined, now)).toEqual({ kind: "never" });
  });

  it("returns today for a same-day sweep", () => {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(deriveRoomSweptState(oneHourAgo, now)).toEqual({ kind: "today" });
  });

  it("returns the days-ago bucket for an older sweep", () => {
    const threeDaysAgo = new Date(now - 3 * DAY_MS - 1000).toISOString();
    expect(deriveRoomSweptState(threeDaysAgo, now)).toEqual({ kind: "daysAgo", days: 3 });
  });
});
