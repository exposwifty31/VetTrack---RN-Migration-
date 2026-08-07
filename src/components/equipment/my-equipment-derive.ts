/**
 * Pure view derivation for MyEquipmentScreen — its own module (the
 * equipment-row-status / tasks-derive pattern) so tests import it without
 * dragging the component tree (Reanimated) into jest.
 *
 * "Now" for every age derivation = when the list data landed
 * (`query.dataUpdatedAt`) — the EquipmentRow `sampledAtMs` idiom: pure during
 * render, refetches drive re-derivation, no timers age it in place.
 */
import type { ChipTone } from "@/components/ui/chip-tone";
import {
  aggregateCustodyDebt,
  compareCustodyDebtAttention,
  custodyDebtBreakdownSegments,
  deriveCustodyDebtSnapshot,
  resolveCustodyDebtBadgeKey,
  resolveCustodyDebtBannerKey,
  type CustodyDebtBadgeKey,
  type CustodyDebtBannerKey,
  type CustodyDebtBreakdownSegment,
  type PersonalCustodyDebt,
} from "@/lib/custody-debt";
import type { EquipmentRow as EquipmentRowType, MyEquipmentItem } from "@/types/api";

/**
 * Adapt a /my row to the EquipmentRow component's item shape. Render-only:
 * the adapted object is never written to the query cache and never POSTed.
 * `/my` returns no `version` column and the row component never reads it —
 * 0 is a typed placeholder, not a claim.
 */
export function toEquipmentRowItem(item: MyEquipmentItem): EquipmentRowType {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    // Every /my row is the caller's active checkout; a missing operational
    // column on an older server degrades to the same custody truth.
    custodyState: item.custodyState ?? "checked_out",
    checkedOutByEmail: item.checkedOutByEmail ?? undefined,
    checkedOutById: item.checkedOutById ?? undefined,
    version: 0,
    lastSeen: item.lastSeen ?? null,
    readinessState: item.readinessState ?? null,
    usageState: item.usageState ?? null,
    checkedOutAt: item.checkedOutAt ?? null,
    expectedReturnMinutes: item.expectedReturnMinutes ?? null,
  };
}

/** Debt badges stay in the semantic-token families — static, never animated. */
export function custodyDebtBadgeTone(key: CustodyDebtBadgeKey): ChipTone {
  return key === "myEquipment.debt.badgeCheckedOutLong" ? "warning" : "stale";
}

export type MyEquipmentEntry = {
  id: string;
  row: EquipmentRowType;
  badgeKey: CustodyDebtBadgeKey | null;
};

export type MyEquipmentView = {
  /** Attention-first (stable sort keeps the server's newest-checkout order within ranks). */
  entries: MyEquipmentEntry[];
  debt: PersonalCustodyDebt;
  bannerKey: CustodyDebtBannerKey | null;
  breakdown: CustodyDebtBreakdownSegment[];
};

export function deriveMyEquipmentView(
  items: readonly MyEquipmentItem[],
  dataUpdatedAtMs: number,
): MyEquipmentView {
  const now = new Date(dataUpdatedAtMs);
  const withSnapshots = items.map((item) => ({
    item,
    snapshot: deriveCustodyDebtSnapshot(item, now),
  }));
  withSnapshots.sort((a, b) => compareCustodyDebtAttention(a.snapshot, b.snapshot));

  const debt = aggregateCustodyDebt(withSnapshots.map((e) => e.snapshot));
  return {
    entries: withSnapshots.map(({ item, snapshot }) => ({
      id: item.id,
      row: toEquipmentRowItem(item),
      badgeKey: resolveCustodyDebtBadgeKey(snapshot),
    })),
    debt,
    bannerKey: resolveCustodyDebtBannerKey(debt),
    breakdown: custodyDebtBreakdownSegments(debt),
  };
}
