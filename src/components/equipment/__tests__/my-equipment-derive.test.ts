/**
 * MyEquipment view derivation — the row adapter (render-only, no fabricated
 * claims beyond the typed `version` placeholder), attention-first ordering,
 * and the banner/badge wiring over the pure custody-debt lib.
 */
import {
  custodyDebtBadgeTone,
  deriveMyEquipmentView,
  toEquipmentRowItem,
} from "../my-equipment-derive";
import type { MyEquipmentItem } from "@/types/api";

const NOW_MS = Date.parse("2026-08-07T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function agoIso(ms: number): string {
  return new Date(NOW_MS - ms).toISOString();
}

function item(overrides: Partial<MyEquipmentItem> & { id: string }): MyEquipmentItem {
  return {
    name: `Item ${overrides.id}`,
    status: "ok",
    custodyState: "checked_out",
    lastSeen: agoIso(HOUR_MS),
    checkedOutAt: agoIso(HOUR_MS),
    checkedOutByEmail: "me@clinic.example",
    ...overrides,
  } as MyEquipmentItem;
}

describe("toEquipmentRowItem", () => {
  it("maps the row fields and defaults custodyState to checked_out", () => {
    const row = toEquipmentRowItem(
      item({ id: "eq1", custodyState: undefined, lastSeen: undefined }),
    );
    expect(row).toMatchObject({
      id: "eq1",
      name: "Item eq1",
      status: "ok",
      custodyState: "checked_out",
      checkedOutByEmail: "me@clinic.example",
      version: 0,
      lastSeen: null,
    });
  });

  it("preserves a real custodyState from the server", () => {
    expect(toEquipmentRowItem(item({ id: "eq1", custodyState: "checked_out" })).custodyState).toBe(
      "checked_out",
    );
  });
});

describe("custodyDebtBadgeTone", () => {
  it("uses warning for long checkouts and stale for the staleness tiers", () => {
    expect(custodyDebtBadgeTone("myEquipment.debt.badgeCheckedOutLong")).toBe("warning");
    expect(custodyDebtBadgeTone("myEquipment.debt.badgeVeryStale")).toBe("stale");
    expect(custodyDebtBadgeTone("myEquipment.debt.badgeStale")).toBe("stale");
  });
});

describe("deriveMyEquipmentView", () => {
  const fresh = item({ id: "fresh" });
  const staleItem = item({ id: "stale", lastSeen: agoIso(30 * HOUR_MS) });
  const longCheckout = item({ id: "long", checkedOutAt: agoIso(50 * HOUR_MS) });
  const veryStale = item({
    id: "verystale",
    lastSeen: agoIso(80 * HOUR_MS),
  });

  it("orders attention-first (very_stale > long > stale > fresh) and keeps ids", () => {
    const view = deriveMyEquipmentView([fresh, staleItem, longCheckout, veryStale], NOW_MS);
    expect(view.entries.map((e) => e.id)).toEqual(["verystale", "long", "stale", "fresh"]);
  });

  it("keeps the server order within equal ranks (stable sort)", () => {
    const staleB = item({ id: "staleB", lastSeen: agoIso(26 * HOUR_MS) });
    const view = deriveMyEquipmentView([staleItem, staleB, fresh], NOW_MS);
    expect(view.entries.map((e) => e.id)).toEqual(["stale", "staleB", "fresh"]);
  });

  it("derives per-entry badge keys and the aggregate banner + breakdown", () => {
    const view = deriveMyEquipmentView([fresh, staleItem, longCheckout], NOW_MS);
    const byId = new Map(view.entries.map((e) => [e.id, e.badgeKey]));
    expect(byId.get("fresh")).toBeNull();
    expect(byId.get("stale")).toBe("myEquipment.debt.badgeStale");
    expect(byId.get("long")).toBe("myEquipment.debt.badgeCheckedOutLong");
    expect(view.debt).toMatchObject({
      totalCheckedOut: 3,
      attentionCount: 2,
      dominantTier: "checked_out_long",
    });
    expect(view.bannerKey).toBe("myEquipment.debt.bannerCheckedOutLong");
    expect(view.breakdown).toEqual([
      { key: "myEquipment.debt.breakdownCheckedOutLong", count: 1 },
      { key: "myEquipment.debt.breakdownStale", count: 1 },
    ]);
  });

  it("yields no banner and no badges when every checkout is current", () => {
    const view = deriveMyEquipmentView([fresh], NOW_MS);
    expect(view.bannerKey).toBeNull();
    expect(view.breakdown).toEqual([]);
    expect(view.entries[0]!.badgeKey).toBeNull();
  });
});
