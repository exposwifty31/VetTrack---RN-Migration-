import {
  deriveAttentionItems,
  deriveExceptions,
  deriveReadiness,
  EXCEPTION_STALE_DAYS,
} from "../home-readiness";
import type { EquipmentRow } from "@/types/api";

const NOW = Date.parse("2026-08-07T12:00:00Z");
const DAY_MS = 86_400_000;

function row(overrides: Partial<EquipmentRow>): EquipmentRow {
  return {
    id: "eq-1",
    name: "Monitor",
    status: "ok",
    custodyState: "docked",
    version: 1,
    ...overrides,
  };
}

describe("deriveReadiness", () => {
  it("returns an all-zero fleet with null coverage when empty", () => {
    expect(deriveReadiness([])).toEqual({
      total: 0,
      ready: 0,
      notReady: 0,
      checkedOut: 0,
      inUse: 0,
      coveragePct: null,
    });
  });

  it("buckets are exclusive and sum to total", () => {
    const items = [
      row({ id: "a" }), // ready
      row({ id: "b", custodyState: "checked_out" }),
      row({ id: "c", usageState: "in_use" }),
      row({ id: "d", readinessState: "not_ready" }),
      // checked_out wins over not_ready — counted once, as checked out
      row({ id: "e", custodyState: "checked_out", readinessState: "not_ready" }),
      row({ id: "f", usageState: "emergency_use" }),
    ];
    const r = deriveReadiness(items);
    expect(r).toEqual({
      total: 6,
      ready: 1,
      notReady: 1,
      checkedOut: 2,
      inUse: 2,
      coveragePct: 17,
    });
    expect(r.ready + r.notReady + r.checkedOut + r.inUse).toBe(r.total);
  });

  it("matches the design reference: 60 ready of 62 → 97%", () => {
    const items = [
      ...Array.from({ length: 60 }, (_, i) => row({ id: `ok-${i}` })),
      row({ id: "nr", readinessState: "not_ready" }),
      row({ id: "co", custodyState: "checked_out" }),
    ];
    const r = deriveReadiness(items);
    expect(r.total).toBe(62);
    expect(r.ready).toBe(60);
    expect(r.coveragePct).toBe(97);
  });

  it("unknown readiness on an idle docked unit counts as covered (documented semantic)", () => {
    const r = deriveReadiness([row({ id: "u", readinessState: "unknown" })]);
    expect(r.ready).toBe(1);
    expect(r.coveragePct).toBe(100);
  });
});

describe("deriveAttentionItems", () => {
  it("empty fleet → empty list (the all-clear state)", () => {
    expect(deriveAttentionItems([], NOW)).toEqual([]);
  });

  it("derives overdue from checkout time + expected-return window", () => {
    const checkedOutAt = new Date(NOW - 3 * 60 * 60_000).toISOString(); // 3h ago
    const items = [
      row({
        id: "od",
        name: "Nebulizer 1",
        custodyState: "checked_out",
        checkedOutAt,
        expectedReturnMinutes: 60,
        checkedOutByEmail: "cohen@example.com",
      }),
    ];
    const [item] = deriveAttentionItems(items, NOW);
    expect(item).toMatchObject({
      id: "od",
      severity: "overdue",
      holder: "cohen@example.com",
    });
    expect(item.dueAtMs).toBe(Date.parse(checkedOutAt) + 60 * 60_000);
  });

  it("a checkout still inside its window is NOT overdue", () => {
    const items = [
      row({
        id: "ok",
        custodyState: "checked_out",
        checkedOutAt: new Date(NOW - 10 * 60_000).toISOString(),
        expectedReturnMinutes: 60,
      }),
    ];
    expect(deriveAttentionItems(items, NOW)).toEqual([]);
  });

  it("a checkout with NO expected-return data is not fabricated into overdue", () => {
    const items = [
      row({
        id: "nodata",
        custodyState: "checked_out",
        checkedOutAt: new Date(NOW - 90 * DAY_MS).toISOString(),
      }),
    ];
    expect(deriveAttentionItems(items, NOW)).toEqual([]);
  });

  it("server-stamped status flags map to their severities, overdue first", () => {
    const items = [
      row({ id: "m", name: "Incubator", status: "maintenance" }),
      row({ id: "o", name: "Pump", status: "overdue" }),
    ];
    expect(deriveAttentionItems(items, NOW).map((i) => i.severity)).toEqual([
      "overdue",
      "maintenance",
    ]);
  });
});

describe("deriveExceptions", () => {
  it("counts only rows last seen more than 14 days ago", () => {
    const items = [
      row({ id: "stale", name: "Glucometer", lastSeen: new Date(NOW - (EXCEPTION_STALE_DAYS + 1) * DAY_MS).toISOString() }),
      row({ id: "fresh", lastSeen: new Date(NOW - 2 * DAY_MS).toISOString() }),
      row({ id: "edge", lastSeen: new Date(NOW - EXCEPTION_STALE_DAYS * DAY_MS + 1).toISOString() }),
    ];
    expect(deriveExceptions(items, NOW)).toEqual([{ id: "stale", name: "Glucometer" }]);
  });

  it("never-scanned rows (lastSeen null) are excluded — honest data seam", () => {
    expect(deriveExceptions([row({ id: "never", lastSeen: null })], NOW)).toEqual([]);
  });
});
