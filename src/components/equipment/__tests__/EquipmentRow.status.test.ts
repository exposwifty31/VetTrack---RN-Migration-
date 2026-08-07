/**
 * Locks the row's pure derivations (extracted with the Aurora restyle):
 *   - status line: custody drives the tier — available (success), held with a
 *     holder email (warning + LTR email), held anonymous (warning).
 *   - stale meta tier: shares the home exceptions field (`lastSeen`) and the
 *     single EXCEPTION_STALE_DAYS threshold, with the same STRICT >14d boundary.
 */
import { DAY_MS, EXCEPTION_STALE_DAYS } from "@/lib/home-readiness";

import { equipmentRowMeta, equipmentRowStatus } from "../equipment-row-status";

describe("equipmentRowStatus", () => {
  test("returns available when not checked out", () => {
    expect(equipmentRowStatus({ custodyState: "available" })).toEqual({ kind: "available" });
  });

  test("returns held_by with the holder email when checked out with an email", () => {
    expect(
      equipmentRowStatus({ custodyState: "checked_out", checkedOutByEmail: "vet@clinic.example" }),
    ).toEqual({ kind: "held_by", email: "vet@clinic.example" });
  });

  test("returns held when checked out without an email", () => {
    expect(equipmentRowStatus({ custodyState: "checked_out" })).toEqual({ kind: "held" });
  });

  test("treats any non-checked_out custody state as available (status colors stay honest)", () => {
    expect(equipmentRowStatus({ custodyState: "staged", checkedOutByEmail: "x@y.z" })).toEqual({
      kind: "available",
    });
  });
});

describe("equipmentRowMeta", () => {
  const NOW = Date.parse("2026-08-07T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

  test("null/undefined lastSeen is never_seen (honest, not stale)", () => {
    expect(equipmentRowMeta(null, NOW)).toEqual({ kind: "never_seen" });
    expect(equipmentRowMeta(undefined, NOW)).toEqual({ kind: "never_seen" });
  });

  test("fresh at 13 days", () => {
    expect(equipmentRowMeta(daysAgo(13), NOW)).toEqual({ kind: "seen", days: 13, stale: false });
  });

  test("exactly 14 days is NOT stale (strict > boundary, matching deriveExceptions)", () => {
    expect(equipmentRowMeta(daysAgo(EXCEPTION_STALE_DAYS), NOW)).toEqual({
      kind: "seen",
      days: 14,
      stale: false,
    });
  });

  test("stale at 15 days", () => {
    expect(equipmentRowMeta(daysAgo(15), NOW)).toEqual({ kind: "seen", days: 15, stale: true });
  });

  test("just past the threshold flips stale while the day count still floors to 14", () => {
    const justPast = new Date(NOW - (EXCEPTION_STALE_DAYS * DAY_MS + 60_000)).toISOString();
    expect(equipmentRowMeta(justPast, NOW)).toEqual({ kind: "seen", days: 14, stale: true });
  });

  test("same-day scan renders day 0, and a future timestamp clamps to 0 (never negative)", () => {
    expect(equipmentRowMeta(daysAgo(0), NOW)).toEqual({ kind: "seen", days: 0, stale: false });
    expect(equipmentRowMeta(daysAgo(-1), NOW)).toEqual({ kind: "seen", days: 0, stale: false });
  });

  test("unparseable timestamp yields null (no meta line, no fabricated claim)", () => {
    expect(equipmentRowMeta("not-a-date", NOW)).toBeNull();
  });
});
