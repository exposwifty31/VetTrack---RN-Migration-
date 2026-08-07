/**
 * Personal custody-debt derivation — a PURE port of the web client's
 * equipment-recovery semantics (read from the vettrack repo 2026-08-07):
 *
 *   src/lib/equipment-recovery-thresholds.ts  → thresholds, verbatim
 *   src/lib/equipment-recovery-state.ts       → per-item snapshot
 *   src/lib/equipment-recovery-adapter.ts     → attention rank/comparator
 *   src/lib/equipment-personal-debt.ts        → aggregate + dominant tier
 *   src/pages/my-equipment-personal-debt-labels.ts / -recovery-labels.ts
 *                                             → banner/breakdown/badge keys
 *
 * Thresholds and boundary semantics are mirrored EXACTLY (including the web's
 * conservative edges: missing/invalid confirm ⇒ `very_stale` level; a FUTURE
 * confirm timestamp is `very_stale` level but NOT `isStale`; `>=` boundaries
 * on stale/too-long). Do not "fix" them here — the web client is the source
 * of truth for what a clinic already understands these labels to mean.
 *
 * Zero imports from components / react — safe for jest and for reuse by any
 * future custody surface.
 */

/** Max age since last confirm still treated as recently confirmed. */
export const RECENTLY_CONFIRMED_MS = 4 * 60 * 60 * 1000;

/** Min age since last confirm before {@link isCustodyDebtStale} is true. */
export const STALE_MS = 24 * 60 * 60 * 1000;

/** Min age since last confirm for staleness level `very_stale`. */
export const VERY_STALE_MS = 72 * 60 * 60 * 1000;

/** Min checkout duration before an item counts as checked out too long. */
export const CHECKED_OUT_TOO_LONG_MS = 48 * 60 * 60 * 1000;

export type CustodyDebtStalenessLevel = "recent" | "stale" | "very_stale";

export type CustodyDebtTier = "checked_out_long" | "very_stale" | "stale" | "none";

export type CustodyDebtConfirmSource = "last_seen" | "last_verified" | "none";

/** Minimal fields custody-debt derivation reads (a MyEquipmentItem subset). */
export interface CustodyDebtSource {
  lastSeen?: string | Date | null;
  lastVerifiedAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  custodyState?: string | null;
}

export interface CustodyDebtSnapshot {
  stalenessLevel: CustodyDebtStalenessLevel;
  isStale: boolean;
  isCheckedOutTooLong: boolean;
  confirmSource: CustodyDebtConfirmSource;
  confirmAt: string | null;
  needsAttention: boolean;
}

function toEpochMs(timestamp: string | Date | null | undefined): number | null {
  if (timestamp == null) return null;
  const instant = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const ms = instant.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ageMsSince(timestamp: string | Date | null | undefined, now: Date): number | null {
  const ms = toEpochMs(timestamp);
  return ms == null ? null : now.getTime() - ms;
}

/**
 * Staleness classification. Missing or invalid timestamps are `very_stale`
 * (conservative for recovery UX — web verbatim, including `ageMs < 0`).
 */
export function custodyDebtStalenessLevel(
  confirmAt: string | Date | null | undefined,
  now: Date,
): CustodyDebtStalenessLevel {
  const ageMs = ageMsSince(confirmAt, now);
  if (ageMs == null || ageMs < 0) return "very_stale";
  if (ageMs < RECENTLY_CONFIRMED_MS) return "recent";
  if (ageMs < VERY_STALE_MS) return "stale";
  return "very_stale";
}

/** True when the last confirm is at or past the stale threshold (>= 24h). */
export function isCustodyDebtStale(
  confirmAt: string | Date | null | undefined,
  now: Date,
): boolean {
  const ageMs = ageMsSince(confirmAt, now);
  if (ageMs == null) return true;
  if (ageMs < 0) return false;
  return ageMs >= STALE_MS;
}

/** True when checkout duration meets or exceeds the too-long threshold (>= 48h). */
export function isCheckedOutTooLong(
  checkedOutAt: string | Date | null | undefined,
  now: Date,
): boolean {
  const ageMs = ageMsSince(checkedOutAt, now);
  if (ageMs == null) return false;
  if (ageMs < 0) return false;
  return ageMs >= CHECKED_OUT_TOO_LONG_MS;
}

/** Which confirm timestamp drives staleness — the NEWER of seen vs verified. */
export function resolveCustodyDebtConfirm(
  source: Pick<CustodyDebtSource, "lastSeen" | "lastVerifiedAt">,
): { source: CustodyDebtConfirmSource; at: Date | null } {
  const seenMs = toEpochMs(source.lastSeen);
  const verifiedMs = toEpochMs(source.lastVerifiedAt);

  if (seenMs == null && verifiedMs == null) {
    return { source: "none", at: null };
  }
  if (seenMs == null) {
    return { source: "last_verified", at: new Date(verifiedMs!) };
  }
  if (verifiedMs == null) {
    return { source: "last_seen", at: new Date(seenMs) };
  }
  if (verifiedMs >= seenMs) {
    return { source: "last_verified", at: new Date(verifiedMs) };
  }
  return { source: "last_seen", at: new Date(seenMs) };
}

/**
 * True when custody (or the legacy checkout timestamp) indicates an active
 * checkout — the too-long tier applies only then (web verbatim: a known
 * non-checked-out custodyState wins over a lingering checkedOutAt).
 */
export function isCheckedOutForCustodyDebt(source: CustodyDebtSource): boolean {
  const { custodyState, checkedOutAt } = source;
  if (custodyState === "checked_out") return true;
  if (custodyState === "docked" || custodyState === "returned" || custodyState === "untracked") {
    return false;
  }
  return checkedOutAt != null;
}

/** Per-item custody-debt snapshot (optional fixed `now` for determinism). */
export function deriveCustodyDebtSnapshot(
  source: CustodyDebtSource,
  now: Date = new Date(),
): CustodyDebtSnapshot {
  const confirm = resolveCustodyDebtConfirm(source);
  const stalenessLevel = custodyDebtStalenessLevel(confirm.at, now);
  const isStale = isCustodyDebtStale(confirm.at, now);
  const checkedOutGated = isCheckedOutForCustodyDebt(source);
  const isCheckedOutTooLongFlag = checkedOutGated && isCheckedOutTooLong(source.checkedOutAt, now);
  return {
    stalenessLevel,
    isStale,
    isCheckedOutTooLong: isCheckedOutTooLongFlag,
    confirmSource: confirm.source,
    confirmAt: confirm.at?.toISOString() ?? null,
    needsAttention: isStale || isCheckedOutTooLongFlag,
  };
}

/**
 * Per-item tier for attention items — checked-out-too-long wins over the
 * staleness tiers (web `tierForAttentionSnapshot` precedence, verbatim).
 */
export function custodyDebtTier(snapshot: CustodyDebtSnapshot): CustodyDebtTier {
  if (!snapshot.needsAttention) return "none";
  if (snapshot.isCheckedOutTooLong) return "checked_out_long";
  if (snapshot.stalenessLevel === "very_stale") return "very_stale";
  if (snapshot.isStale) return "stale";
  return "stale";
}

export interface PersonalCustodyDebt {
  totalCheckedOut: number;
  attentionCount: number;
  byTier: {
    checkedOutLong: number;
    veryStale: number;
    stale: number;
  };
  /** Highest-severity tier present among attention items, or "none". */
  dominantTier: CustodyDebtTier;
}

function resolveDominantTier(byTier: PersonalCustodyDebt["byTier"]): CustodyDebtTier {
  if (byTier.checkedOutLong > 0) return "checked_out_long";
  if (byTier.veryStale > 0) return "very_stale";
  if (byTier.stale > 0) return "stale";
  return "none";
}

/** Aggregate over per-item snapshots (callers that already derived them). */
export function aggregateCustodyDebt(
  snapshots: readonly CustodyDebtSnapshot[],
): PersonalCustodyDebt {
  const byTier = { checkedOutLong: 0, veryStale: 0, stale: 0 };
  let attentionCount = 0;
  for (const snapshot of snapshots) {
    if (!snapshot.needsAttention) continue;
    attentionCount += 1;
    const tier = custodyDebtTier(snapshot);
    if (tier === "checked_out_long") byTier.checkedOutLong += 1;
    else if (tier === "very_stale") byTier.veryStale += 1;
    else if (tier === "stale") byTier.stale += 1;
  }
  return {
    totalCheckedOut: snapshots.length,
    attentionCount,
    byTier,
    dominantTier: resolveDominantTier(byTier),
  };
}

/** User-scoped custody debt over the items checked out to the current user. */
export function derivePersonalCustodyDebt(
  items: readonly CustodyDebtSource[],
  now: Date = new Date(),
): PersonalCustodyDebt {
  return aggregateCustodyDebt(items.map((item) => deriveCustodyDebtSnapshot(item, now)));
}

/**
 * Stable numeric urgency rank for attention sorting (web `recoveryAttentionRank`
 * verbatim — note it ranks `very_stale` ABOVE too-long, unlike the tier
 * precedence above; both are mirrored bug-for-bug from the web client).
 */
export function custodyDebtAttentionRank(snapshot: CustodyDebtSnapshot): number {
  if (!snapshot.needsAttention) return 0;
  if (snapshot.stalenessLevel === "very_stale") return 400;
  if (snapshot.isCheckedOutTooLong) return 300;
  if (snapshot.isStale) return 200;
  return 100;
}

/** Comparator for `Array.sort`: more urgent snapshots sort earlier. */
export function compareCustodyDebtAttention(
  a: CustodyDebtSnapshot,
  b: CustodyDebtSnapshot,
): number {
  return custodyDebtAttentionRank(b) - custodyDebtAttentionRank(a);
}

// ── i18n label resolution (keys live under myEquipment.debt.*) ──────────────

export type CustodyDebtBannerKey =
  | "myEquipment.debt.bannerCheckedOutLong"
  | "myEquipment.debt.bannerVeryStale"
  | "myEquipment.debt.bannerStale";

/** Aggregate → dominant-tier banner key, or null when nothing needs attention. */
export function resolveCustodyDebtBannerKey(
  debt: PersonalCustodyDebt,
): CustodyDebtBannerKey | null {
  if (debt.attentionCount === 0 || debt.dominantTier === "none") return null;
  switch (debt.dominantTier) {
    case "checked_out_long":
      return "myEquipment.debt.bannerCheckedOutLong";
    case "very_stale":
      return "myEquipment.debt.bannerVeryStale";
    case "stale":
      return "myEquipment.debt.bannerStale";
    default:
      return null;
  }
}

export type CustodyDebtBreakdownKey =
  | "myEquipment.debt.breakdownCheckedOutLong"
  | "myEquipment.debt.breakdownVeryStale"
  | "myEquipment.debt.breakdownStale";

export type CustodyDebtBreakdownSegment = { key: CustodyDebtBreakdownKey; count: number };

/** Non-zero tier buckets in display order (long checkout → very stale → stale). */
export function custodyDebtBreakdownSegments(
  debt: PersonalCustodyDebt,
): CustodyDebtBreakdownSegment[] {
  const segments: CustodyDebtBreakdownSegment[] = [];
  if (debt.byTier.checkedOutLong > 0) {
    segments.push({
      key: "myEquipment.debt.breakdownCheckedOutLong",
      count: debt.byTier.checkedOutLong,
    });
  }
  if (debt.byTier.veryStale > 0) {
    segments.push({ key: "myEquipment.debt.breakdownVeryStale", count: debt.byTier.veryStale });
  }
  if (debt.byTier.stale > 0) {
    segments.push({ key: "myEquipment.debt.breakdownStale", count: debt.byTier.stale });
  }
  return segments;
}

export type CustodyDebtBadgeKey =
  | "myEquipment.debt.badgeCheckedOutLong"
  | "myEquipment.debt.badgeVeryStale"
  | "myEquipment.debt.badgeStale";

/**
 * Per-item badge key, or null when the item needs no attention.
 * Checked-out-too-long wins over the staleness tiers (web verbatim).
 */
export function resolveCustodyDebtBadgeKey(
  snapshot: CustodyDebtSnapshot,
): CustodyDebtBadgeKey | null {
  if (!snapshot.needsAttention) return null;
  if (snapshot.isCheckedOutTooLong) return "myEquipment.debt.badgeCheckedOutLong";
  if (snapshot.stalenessLevel === "very_stale") return "myEquipment.debt.badgeVeryStale";
  if (snapshot.isStale) return "myEquipment.debt.badgeStale";
  return null;
}
