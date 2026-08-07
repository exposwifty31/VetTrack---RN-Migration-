/**
 * Custody-debt pure-lib tests — lock the web-ported thresholds and boundary
 * semantics verbatim (equipment-recovery-{thresholds,state,adapter}.ts +
 * equipment-personal-debt.ts + the my-equipment label resolvers).
 */
import {
  CHECKED_OUT_TOO_LONG_MS,
  RECENTLY_CONFIRMED_MS,
  STALE_MS,
  VERY_STALE_MS,
  aggregateCustodyDebt,
  compareCustodyDebtAttention,
  custodyDebtAttentionRank,
  custodyDebtBreakdownSegments,
  custodyDebtStalenessLevel,
  custodyDebtTier,
  deriveCustodyDebtSnapshot,
  derivePersonalCustodyDebt,
  isCheckedOutForCustodyDebt,
  isCheckedOutTooLong,
  isCustodyDebtStale,
  resolveCustodyDebtBadgeKey,
  resolveCustodyDebtBannerKey,
  resolveCustodyDebtConfirm,
} from "../custody-debt";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function agoIso(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("threshold constants (web-verbatim)", () => {
  it("mirrors the web thresholds exactly", () => {
    expect(RECENTLY_CONFIRMED_MS).toBe(4 * HOUR_MS);
    expect(STALE_MS).toBe(24 * HOUR_MS);
    expect(VERY_STALE_MS).toBe(72 * HOUR_MS);
    expect(CHECKED_OUT_TOO_LONG_MS).toBe(48 * HOUR_MS);
  });
});

describe("custodyDebtStalenessLevel", () => {
  it("classifies missing/invalid confirm as very_stale (conservative)", () => {
    expect(custodyDebtStalenessLevel(null, NOW)).toBe("very_stale");
    expect(custodyDebtStalenessLevel("not-a-date", NOW)).toBe("very_stale");
  });

  it("classifies a FUTURE confirm as very_stale level (web ageMs<0 branch)", () => {
    expect(custodyDebtStalenessLevel(agoIso(-HOUR_MS), NOW)).toBe("very_stale");
  });

  it("is recent strictly below 4h, stale from 4h, very_stale from 72h", () => {
    expect(custodyDebtStalenessLevel(agoIso(RECENTLY_CONFIRMED_MS - 1), NOW)).toBe("recent");
    expect(custodyDebtStalenessLevel(agoIso(RECENTLY_CONFIRMED_MS), NOW)).toBe("stale");
    expect(custodyDebtStalenessLevel(agoIso(VERY_STALE_MS - 1), NOW)).toBe("stale");
    expect(custodyDebtStalenessLevel(agoIso(VERY_STALE_MS), NOW)).toBe("very_stale");
  });
});

describe("isCustodyDebtStale", () => {
  it("is true from exactly 24h (>= boundary), false below", () => {
    expect(isCustodyDebtStale(agoIso(STALE_MS), NOW)).toBe(true);
    expect(isCustodyDebtStale(agoIso(STALE_MS - 1), NOW)).toBe(false);
  });

  it("treats missing confirm as stale but a FUTURE confirm as not stale", () => {
    expect(isCustodyDebtStale(null, NOW)).toBe(true);
    expect(isCustodyDebtStale(agoIso(-HOUR_MS), NOW)).toBe(false);
  });
});

describe("isCheckedOutTooLong", () => {
  it("is true from exactly 48h, false below and for missing/future timestamps", () => {
    expect(isCheckedOutTooLong(agoIso(CHECKED_OUT_TOO_LONG_MS), NOW)).toBe(true);
    expect(isCheckedOutTooLong(agoIso(CHECKED_OUT_TOO_LONG_MS - 1), NOW)).toBe(false);
    expect(isCheckedOutTooLong(null, NOW)).toBe(false);
    expect(isCheckedOutTooLong(agoIso(-HOUR_MS), NOW)).toBe(false);
  });
});

describe("resolveCustodyDebtConfirm", () => {
  it("uses the NEWER of lastSeen vs lastVerifiedAt; verified wins ties", () => {
    const older = agoIso(10 * HOUR_MS);
    const newer = agoIso(HOUR_MS);
    expect(resolveCustodyDebtConfirm({ lastSeen: newer, lastVerifiedAt: older }).source).toBe(
      "last_seen",
    );
    expect(resolveCustodyDebtConfirm({ lastSeen: older, lastVerifiedAt: newer }).source).toBe(
      "last_verified",
    );
    expect(resolveCustodyDebtConfirm({ lastSeen: newer, lastVerifiedAt: newer }).source).toBe(
      "last_verified",
    );
    expect(resolveCustodyDebtConfirm({})).toEqual({ source: "none", at: null });
  });
});

describe("isCheckedOutForCustodyDebt (custody gating)", () => {
  it("gates on custodyState first, then the legacy checkedOutAt fallback", () => {
    expect(isCheckedOutForCustodyDebt({ custodyState: "checked_out" })).toBe(true);
    expect(
      isCheckedOutForCustodyDebt({ custodyState: "docked", checkedOutAt: agoIso(100 * HOUR_MS) }),
    ).toBe(false);
    expect(isCheckedOutForCustodyDebt({ custodyState: "returned", checkedOutAt: agoIso(1) })).toBe(
      false,
    );
    expect(isCheckedOutForCustodyDebt({ custodyState: "untracked" })).toBe(false);
    expect(isCheckedOutForCustodyDebt({ checkedOutAt: agoIso(1) })).toBe(true);
    expect(isCheckedOutForCustodyDebt({})).toBe(false);
  });
});

describe("deriveCustodyDebtSnapshot", () => {
  it("flags a long checkout even when the confirm is fresh", () => {
    const snapshot = deriveCustodyDebtSnapshot(
      {
        lastSeen: agoIso(HOUR_MS),
        checkedOutAt: agoIso(50 * HOUR_MS),
        custodyState: "checked_out",
      },
      NOW,
    );
    expect(snapshot.isStale).toBe(false);
    expect(snapshot.isCheckedOutTooLong).toBe(true);
    expect(snapshot.needsAttention).toBe(true);
  });

  it("suppresses the too-long flag when custody says not checked out", () => {
    const snapshot = deriveCustodyDebtSnapshot(
      {
        lastSeen: agoIso(HOUR_MS),
        checkedOutAt: agoIso(100 * HOUR_MS),
        custodyState: "docked",
      },
      NOW,
    );
    expect(snapshot.isCheckedOutTooLong).toBe(false);
    expect(snapshot.needsAttention).toBe(false);
  });

  it("derives no attention for a fresh short checkout", () => {
    const snapshot = deriveCustodyDebtSnapshot(
      { lastSeen: agoIso(HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
      NOW,
    );
    expect(snapshot).toMatchObject({
      stalenessLevel: "recent",
      isStale: false,
      isCheckedOutTooLong: false,
      needsAttention: false,
      confirmSource: "last_seen",
    });
  });
});

describe("custodyDebtTier / rank precedence (web-verbatim, including the divergence)", () => {
  const tooLongAndVeryStale = deriveCustodyDebtSnapshot(
    { lastSeen: agoIso(100 * HOUR_MS), checkedOutAt: agoIso(100 * HOUR_MS), custodyState: "checked_out" },
    NOW,
  );
  const tooLongOnly = deriveCustodyDebtSnapshot(
    { lastSeen: agoIso(HOUR_MS), checkedOutAt: agoIso(50 * HOUR_MS), custodyState: "checked_out" },
    NOW,
  );
  const staleOnly = deriveCustodyDebtSnapshot(
    { lastSeen: agoIso(30 * HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
    NOW,
  );
  const fresh = deriveCustodyDebtSnapshot(
    { lastSeen: agoIso(HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
    NOW,
  );

  it("tier: checked_out_long WINS over very_stale for the same item", () => {
    expect(custodyDebtTier(tooLongAndVeryStale)).toBe("checked_out_long");
    expect(custodyDebtTier(tooLongOnly)).toBe("checked_out_long");
    expect(custodyDebtTier(staleOnly)).toBe("stale");
    expect(custodyDebtTier(fresh)).toBe("none");
  });

  it("rank: very_stale (400) OUTRANKS too-long (300) — mirrored bug-for-bug", () => {
    expect(custodyDebtAttentionRank(tooLongAndVeryStale)).toBe(400);
    expect(custodyDebtAttentionRank(tooLongOnly)).toBe(300);
    expect(custodyDebtAttentionRank(staleOnly)).toBe(200);
    expect(custodyDebtAttentionRank(fresh)).toBe(0);
  });

  it("comparator sorts more-urgent snapshots first", () => {
    const sorted = [fresh, staleOnly, tooLongAndVeryStale, tooLongOnly].sort(
      compareCustodyDebtAttention,
    );
    expect(sorted).toEqual([tooLongAndVeryStale, tooLongOnly, staleOnly, fresh]);
  });
});

describe("aggregate + labels", () => {
  const items = [
    // checked_out_long tier (fresh confirm, 50h checkout)
    { lastSeen: agoIso(HOUR_MS), checkedOutAt: agoIso(50 * HOUR_MS), custodyState: "checked_out" },
    // very_stale tier (80h confirm, short checkout)
    { lastSeen: agoIso(80 * HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
    // stale tier (30h confirm)
    { lastSeen: agoIso(30 * HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
    // no attention
    { lastSeen: agoIso(HOUR_MS), checkedOutAt: agoIso(HOUR_MS), custodyState: "checked_out" },
  ];

  it("counts tiers, attention, and resolves the dominant tier by severity order", () => {
    const debt = derivePersonalCustodyDebt(items, NOW);
    expect(debt).toEqual({
      totalCheckedOut: 4,
      attentionCount: 3,
      byTier: { checkedOutLong: 1, veryStale: 1, stale: 1 },
      dominantTier: "checked_out_long",
    });
  });

  it("dominant tier falls through checkedOutLong → veryStale → stale → none", () => {
    expect(derivePersonalCustodyDebt(items.slice(1), NOW).dominantTier).toBe("very_stale");
    expect(derivePersonalCustodyDebt(items.slice(2), NOW).dominantTier).toBe("stale");
    expect(derivePersonalCustodyDebt(items.slice(3), NOW).dominantTier).toBe("none");
    expect(derivePersonalCustodyDebt([], NOW).dominantTier).toBe("none");
  });

  it("banner key follows the dominant tier and is null with no attention", () => {
    expect(resolveCustodyDebtBannerKey(derivePersonalCustodyDebt(items, NOW))).toBe(
      "myEquipment.debt.bannerCheckedOutLong",
    );
    expect(resolveCustodyDebtBannerKey(derivePersonalCustodyDebt(items.slice(1), NOW))).toBe(
      "myEquipment.debt.bannerVeryStale",
    );
    expect(resolveCustodyDebtBannerKey(derivePersonalCustodyDebt(items.slice(2), NOW))).toBe(
      "myEquipment.debt.bannerStale",
    );
    expect(resolveCustodyDebtBannerKey(derivePersonalCustodyDebt(items.slice(3), NOW))).toBeNull();
  });

  it("breakdown lists only non-zero buckets in display order", () => {
    expect(custodyDebtBreakdownSegments(derivePersonalCustodyDebt(items, NOW))).toEqual([
      { key: "myEquipment.debt.breakdownCheckedOutLong", count: 1 },
      { key: "myEquipment.debt.breakdownVeryStale", count: 1 },
      { key: "myEquipment.debt.breakdownStale", count: 1 },
    ]);
    expect(custodyDebtBreakdownSegments(derivePersonalCustodyDebt(items.slice(2), NOW))).toEqual([
      { key: "myEquipment.debt.breakdownStale", count: 1 },
    ]);
    expect(custodyDebtBreakdownSegments(derivePersonalCustodyDebt([], NOW))).toEqual([]);
  });

  it("badge key mirrors the per-item tier precedence and is null when fresh", () => {
    const [long, veryStale, stale, fresh] = items.map((item) =>
      deriveCustodyDebtSnapshot(item, NOW),
    );
    expect(resolveCustodyDebtBadgeKey(long!)).toBe("myEquipment.debt.badgeCheckedOutLong");
    expect(resolveCustodyDebtBadgeKey(veryStale!)).toBe("myEquipment.debt.badgeVeryStale");
    expect(resolveCustodyDebtBadgeKey(stale!)).toBe("myEquipment.debt.badgeStale");
    expect(resolveCustodyDebtBadgeKey(fresh!)).toBeNull();
  });

  it("aggregateCustodyDebt over pre-derived snapshots matches derivePersonalCustodyDebt", () => {
    const snapshots = items.map((item) => deriveCustodyDebtSnapshot(item, NOW));
    expect(aggregateCustodyDebt(snapshots)).toEqual(derivePersonalCustodyDebt(items, NOW));
  });
});
