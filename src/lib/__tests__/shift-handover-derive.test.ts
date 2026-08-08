/**
 * Pure-derivation tests for the handover artifact — the acknowledged-state
 * toggle (Slice 9's required toggle test), delta counts, and staff resolution.
 * No i18n / auth-fetch imports here, so no mocks are needed.
 */
import {
  handoverDeltaCounts,
  isHandoverAcknowledged,
  resolveStaffName,
} from "../api/shift-handover-derive";
import type { HandoverArtifact, HandoverStaff } from "../api/shift-handover";

const EMPTY_DELTAS: HandoverArtifact["deltas"] = {
  custody: [],
  taskState: [],
  alerts: [],
  dispenses: [],
};

function delta(sourceId: string): HandoverArtifact["deltas"]["custody"][number] {
  return { sourceId, kind: "x", targetId: null, targetType: null, at: "2026-08-08T00:00:00.000Z" };
}

describe("isHandoverAcknowledged (acknowledged-state toggle)", () => {
  it("is false when acknowledgedAt is null (unconfirmed)", () => {
    expect(isHandoverAcknowledged({ acknowledgedAt: null })).toBe(false);
  });

  it("is true once acknowledgedAt is set (acknowledged)", () => {
    expect(isHandoverAcknowledged({ acknowledgedAt: "2026-08-08T09:00:00.000Z" })).toBe(true);
  });

  it("toggles false → true → false across acknowledge / unconfirm rows", () => {
    // The two mutations return the updated artifact; the CTA keys on this flag.
    const unacked = { acknowledgedAt: null };
    const acked = { acknowledgedAt: "2026-08-08T09:00:00.000Z" };
    expect(isHandoverAcknowledged(unacked)).toBe(false);
    expect(isHandoverAcknowledged(acked)).toBe(true);
    expect(isHandoverAcknowledged(unacked)).toBe(false);
  });
});

describe("handoverDeltaCounts", () => {
  it("returns zeros with a zero total for empty deltas", () => {
    expect(handoverDeltaCounts({ deltas: EMPTY_DELTAS })).toEqual({
      custody: 0,
      taskState: 0,
      alerts: 0,
      dispenses: 0,
      total: 0,
    });
  });

  it("counts each dimension and sums the total", () => {
    expect(
      handoverDeltaCounts({
        deltas: {
          custody: [delta("a"), delta("b")],
          taskState: [delta("c")],
          alerts: [],
          dispenses: [delta("d"), delta("e"), delta("f")],
        },
      }),
    ).toEqual({ custody: 2, taskState: 1, alerts: 0, dispenses: 3, total: 6 });
  });
});

describe("resolveStaffName", () => {
  const staff: HandoverStaff[] = [
    { userId: "u-1", name: "Dana Levi" },
    { userId: "u-2", name: "דנה כהן" },
  ];

  it("resolves a mapped tech id to its display name", () => {
    expect(resolveStaffName(staff, "u-1")).toBe("Dana Levi");
    expect(resolveStaffName(staff, "u-2")).toBe("דנה כהן");
  });

  it("returns null for an unmapped tech id", () => {
    expect(resolveStaffName(staff, "u-missing")).toBeNull();
    expect(resolveStaffName([], "u-1")).toBeNull();
  });
});
