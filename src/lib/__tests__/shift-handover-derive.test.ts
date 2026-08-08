/**
 * Pure-derivation tests for the handover artifact — the acknowledged-state
 * toggle (Slice 9's required toggle test), delta counts, and staff resolution.
 * No i18n / auth-fetch imports here, so no mocks are needed.
 */
import {
  buildHandoffRows,
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

describe("buildHandoffRows", () => {
  const BASE: HandoverArtifact = {
    id: "h1",
    shiftSessionId: "s1",
    revision: 1,
    deltas: EMPTY_DELTAS,
    openItems: [],
    observedSignals: [],
    patientWorklist: { state: "not_configured" },
    acknowledgedBy: null,
    acknowledgedAt: null,
    notificationReadAt: null,
    generatedAt: "2026-08-08T06:00:00.000Z",
    staff: [{ userId: "u-1", name: "Dana Levi" }, { userId: "u-2", name: "דנה כהן" }],
  };

  it("omits the open-items heading when there are no open items", () => {
    const rows = buildHandoffRows(BASE);
    expect(rows.some((r) => r.type === "heading" && r.titleKey === "handoff.openItems.title")).toBe(
      false,
    );
    // The worklist heading is always present.
    expect(rows[0]).toMatchObject({ type: "heading", titleKey: "handoff.worklist.title" });
  });

  it("emits the open-items heading then one row per open item, before the worklist heading", () => {
    const rows = buildHandoffRows({
      ...BASE,
      openItems: [
        { id: "oi-1", kind: "alert", summary: "פריט פתוח" },
        { id: "oi-2", kind: "note", summary: "second" },
      ],
    });
    expect(rows.slice(0, 4)).toEqual([
      { key: "openItems:heading", type: "heading", titleKey: "handoff.openItems.title" },
      { key: "openItem:oi-1", type: "openItem", summary: "פריט פתוח" },
      { key: "openItem:oi-2", type: "openItem", summary: "second" },
      { key: "worklist:heading", type: "heading", titleKey: "handoff.worklist.title" },
    ]);
  });

  it("renders not_configured as a muted worklist message with no code", () => {
    const rows = buildHandoffRows(BASE);
    expect(rows).toContainEqual({
      key: "worklist:notConfigured",
      type: "worklistMessage",
      messageKey: "handoff.worklist.notConfigured",
      code: null,
      tone: "muted",
    });
  });

  it("carries the error code on a danger-toned worklist message", () => {
    const rows = buildHandoffRows({
      ...BASE,
      patientWorklist: { state: "error", code: "timeout" },
    });
    expect(rows).toContainEqual({
      key: "worklist:error",
      type: "worklistMessage",
      messageKey: "handoff.worklist.error",
      code: "timeout",
      tone: "danger",
    });
  });

  it("renders an empty ready worklist as a muted empty message", () => {
    const rows = buildHandoffRows({
      ...BASE,
      patientWorklist: { state: "ready", entries: [] },
    });
    expect(rows).toContainEqual({
      key: "worklist:empty",
      type: "worklistMessage",
      messageKey: "handoff.worklist.empty",
      code: null,
      tone: "muted",
    });
  });

  it("resolves each entry's tech name (Hebrew carried verbatim) and null when unmapped", () => {
    const rows = buildHandoffRows({
      ...BASE,
      patientWorklist: {
        state: "ready",
        entries: [
          { externalId: "PMS-1", display: "Rex", byTechId: "u-2" },
          { externalId: "PMS-2", display: "Milo", byTechId: "u-missing" },
        ],
      },
    });
    const entries = rows.filter((r) => r.type === "worklistEntry");
    // techName is carried verbatim — NOT LTR-isolated (RTL-first; isolation is a render concern).
    expect(entries).toEqual([
      {
        key: "worklistEntry:PMS-1:0",
        type: "worklistEntry",
        display: "Rex",
        externalId: "PMS-1",
        techName: "דנה כהן",
      },
      {
        key: "worklistEntry:PMS-2:1",
        type: "worklistEntry",
        display: "Milo",
        externalId: "PMS-2",
        techName: null,
      },
    ]);
  });

  it("produces unique row keys across a fully-populated document", () => {
    const rows = buildHandoffRows({
      ...BASE,
      openItems: [
        { id: "oi-1", kind: "alert", summary: "a" },
        { id: "oi-2", kind: "note", summary: "b" },
      ],
      patientWorklist: {
        state: "ready",
        entries: [
          { externalId: "PMS-1", display: "Rex", byTechId: "u-1" },
          { externalId: "PMS-1", display: "Rex again", byTechId: "u-2" },
        ],
      },
    });
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
