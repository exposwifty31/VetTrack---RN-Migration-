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

/**
 * No-station = resting item with no resolvable home dock (server bucket
 * `no_station`). Confirming one is a server no-op: the commit contract counts
 * it in `skippedNoStationCount` — neither swept nor missing — so it must be
 * kept OUT of the sweepable checklist, the present/missing summary, and the
 * commit payload, and rendered as its own explicit read-only group.
 */
export function isNoStation(item: Pick<SweepItem, "bucket">): boolean {
  return item.bucket === "no_station";
}

/**
 * Sweepable = resting (no holder, D-9) AND has a resolvable home station.
 * A resting `no_station` item is NOT sweepable — see `isNoStation`.
 */
export function isSweepable(item: Pick<SweepItem, "checkedOutById" | "bucket">): boolean {
  return item.checkedOutById == null && !isNoStation(item);
}

export type SweepPartition = Readonly<{
  /** Resting items with a home station — toggleable in the checklist. */
  sweepable: SweepItem[];
  /** Resting items with no home station — read-only, skipped on commit. */
  noStation: SweepItem[];
  /** Checked-out items — read-only, accounted, never swept/missing. */
  accounted: SweepItem[];
}>;

/**
 * Split the worklist into three disjoint sets: sweepable (resting + stationed),
 * noStation (resting, no home dock → skipped), and accounted (in-use). The
 * checked-out check wins first so a checked-out item never leaks into another
 * bucket (D-9).
 */
export function partitionSweepItems(items: readonly SweepItem[]): SweepPartition {
  const sweepable: SweepItem[] = [];
  const noStation: SweepItem[] = [];
  const accounted: SweepItem[] = [];
  for (const item of items) {
    if (item.checkedOutById != null) accounted.push(item);
    else if (isNoStation(item)) noStation.push(item);
    else sweepable.push(item);
  }
  return { sweepable, noStation, accounted };
}

/**
 * A flat, virtualization-friendly row model for the room-sweep FlashList
 * (rn-best-practices: the collection renders through a FlashList `data` model,
 * never `.map` inside a ScrollView). Section labels are interleaved as their
 * own rows so a single list carries all three partitions.
 */
/** The two section-divider labels the sweep list can emit (typed i18n keys). */
export type SweepSectionLabelKey = "roomDetail.sweep.noStation" | "roomDetail.sweep.accounted";

export type SweepListRow =
  | Readonly<{ kind: "label"; key: string; labelKey: SweepSectionLabelKey }>
  | Readonly<{ kind: "item"; key: string; item: SweepItem }>;

/** Flatten a partition into `[sweepable…, (label) noStation…, (label) accounted…]`. */
export function buildSweepListModel(partition: SweepPartition): SweepListRow[] {
  const rows: SweepListRow[] = [];
  for (const item of partition.sweepable) rows.push({ kind: "item", key: item.id, item });
  if (partition.noStation.length > 0) {
    rows.push({ kind: "label", key: "label:no_station", labelKey: "roomDetail.sweep.noStation" });
    for (const item of partition.noStation) rows.push({ kind: "item", key: item.id, item });
  }
  if (partition.accounted.length > 0) {
    rows.push({ kind: "label", key: "label:accounted", labelKey: "roomDetail.sweep.accounted" });
    for (const item of partition.accounted) rows.push({ kind: "item", key: item.id, item });
  }
  return rows;
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
 * Present/missing tallies over the SWEEPABLE set only — checked-out AND
 * no-station items are excluded (they are accounted / skipped, never
 * swept/missing). `present` = confirmed stationed-resting; `missing` = the rest.
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
