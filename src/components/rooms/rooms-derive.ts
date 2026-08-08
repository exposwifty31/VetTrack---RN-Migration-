/**
 * Pure room + sweep derivations — the equipment-row-status pattern: colocated
 * with the room components, zero RN imports, unit-tested without the component
 * tree (avoids dragging Reanimated/Uniwind into jest).
 *
 * Sweep semantics mirror the VERIFIED server + web precedents:
 *   - D-9 accounting: a checked-out item (`checkedOutById` non-null) is shown
 *     but NEVER swept or marked missing — it is "accounted", not sweepable
 *     (server sweep POST keys "never sweep" on checkedOutById; web RoomSweep
 *     filters restingItems the same way).
 *   - Accuracy-first default: resting items start UNconfirmed; the tech
 *     confirms presence (web RoomSweep). The commit payload is the confirmed
 *     RESTING ids only — a checked-out id can never leak into it.
 */
import type { ChipTone } from "@/components/ui/chip-tone";
import { relativeDay, type RelativeDay } from "@/lib/datetime";
import type { ReconciliationBucket, SweepItem } from "@/lib/api/docking";

/** Reconciliation bucket → semantic chip tone (static; never animated). */
export function sweepBucketTone(bucket: ReconciliationBucket): ChipTone {
  switch (bucket) {
    case "at_home":
      return "success";
    case "checked_out":
      return "info";
    case "returned_unverified":
    case "returned_away":
    case "misplaced_at_station":
      return "warning";
    case "missing":
      return "danger";
    case "no_station":
      return "stale";
    case "unassigned":
    default:
      return "neutral";
  }
}

const BUCKET_LABEL_KEYS = {
  at_home: "roomDetail.bucket.atHome",
  checked_out: "roomDetail.bucket.checkedOut",
  returned_unverified: "roomDetail.bucket.returnedUnverified",
  returned_away: "roomDetail.bucket.returnedAway",
  misplaced_at_station: "roomDetail.bucket.misplaced",
  missing: "roomDetail.bucket.missing",
  unassigned: "roomDetail.bucket.unassigned",
  no_station: "roomDetail.bucket.noStation",
} as const;

export type SweepBucketLabelKey = (typeof BUCKET_LABEL_KEYS)[keyof typeof BUCKET_LABEL_KEYS];

/** Typed i18n key for a bucket chip. */
export function sweepBucketLabelKey(bucket: ReconciliationBucket): SweepBucketLabelKey {
  return BUCKET_LABEL_KEYS[bucket];
}

/** Resting = no holder. Only resting items are sweepable (D-9). */
export function isSweepable(item: Pick<SweepItem, "checkedOutById">): boolean {
  return item.checkedOutById == null;
}

export type SweepPartition = Readonly<{
  /** Resting items — toggleable in the checklist. */
  sweepable: SweepItem[];
  /** Checked-out items — read-only, accounted, never swept/missing. */
  accounted: SweepItem[];
}>;

/** Split the worklist into the sweepable (resting) and accounted (in-use) sets. */
export function partitionSweepItems(items: readonly SweepItem[]): SweepPartition {
  const sweepable: SweepItem[] = [];
  const accounted: SweepItem[] = [];
  for (const item of items) {
    if (isSweepable(item)) sweepable.push(item);
    else accounted.push(item);
  }
  return { sweepable, accounted };
}

/**
 * The commit payload: confirmed RESTING ids only. A checked-out id present in
 * the confirmed set is excluded here (belt-and-braces — the toggle UI never
 * offers checked-out rows, and the server would silently drop them anyway).
 */
export function buildSweepCommitPayload(
  items: readonly SweepItem[],
  confirmedIds: ReadonlySet<string>,
): string[] {
  return items
    .filter((item) => isSweepable(item) && confirmedIds.has(item.id))
    .map((item) => item.id);
}

export type SweepSummary = Readonly<{ total: number; present: number; missing: number }>;

/**
 * Present/missing tallies over the SWEEPABLE set only (checked-out items are
 * neither). `present` = confirmed resting; `missing` = the rest.
 */
export function sweepSummary(
  items: readonly SweepItem[],
  confirmedIds: ReadonlySet<string>,
): SweepSummary {
  const { sweepable } = partitionSweepItems(items);
  const present = sweepable.filter((item) => confirmedIds.has(item.id)).length;
  return { total: sweepable.length, present, missing: sweepable.length - present };
}

export type RoomSweptState = { kind: "never" } | RelativeDay;

/**
 * Coarse "last swept" state — null → never; otherwise the relative-day bucket
 * (today / yesterday / N days ago). The screen maps the kind to its own i18n
 * copy (and renders the asserter name separately). All-time, not shift-scoped
 * (matches the server derivation).
 */
export function deriveRoomSweptState(
  lastSweptAt: string | null | undefined,
  nowMs: number,
): RoomSweptState {
  if (lastSweptAt == null) return { kind: "never" };
  const relative = relativeDay(lastSweptAt, nowMs);
  return relative ?? { kind: "never" };
}
