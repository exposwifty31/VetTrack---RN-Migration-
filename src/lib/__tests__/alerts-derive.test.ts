/**
 * Alerts derivation — the tested "meat" of Slice 6. Ports the web
 * `computeAlerts` fixture semantics (`tests/compute-alerts-status.test.ts` +
 * `src/lib/utils.ts`) and covers the ack-join view + role pre-gate. Pure: no
 * i18n, no RN, no Reanimated — `nowMs` is threaded so every case is deterministic.
 */
import {
  ALERT_SEVERITY,
  alertAckKey,
  alertTone,
  buildAckMap,
  canManageAlerts,
  computeAlerts,
  daysOverdue,
  deriveAlertsView,
  isInactive,
  isOverdue,
  isSterilizationDue,
  type AlertAckInput,
  type AlertEquipmentInput,
} from "@/lib/alerts-derive";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-08T12:00:00.000Z");

function ago(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function eq(overrides: Partial<AlertEquipmentInput> = {}): AlertEquipmentInput {
  return {
    id: "eq-1",
    name: "Pump",
    status: "ok",
    lastSeen: ago(0),
    lastMaintenanceDate: null,
    lastSterilizationDate: null,
    maintenanceIntervalDays: null,
    ...overrides,
  };
}

describe("predicates", () => {
  it("isOverdue: true only past lastMaintenance + intervalDays", () => {
    expect(isOverdue(eq({ lastMaintenanceDate: ago(40), maintenanceIntervalDays: 30 }), NOW)).toBe(
      true,
    );
    expect(isOverdue(eq({ lastMaintenanceDate: ago(20), maintenanceIntervalDays: 30 }), NOW)).toBe(
      false,
    );
    // Missing either field cannot be overdue.
    expect(isOverdue(eq({ lastMaintenanceDate: ago(40), maintenanceIntervalDays: null }), NOW)).toBe(
      false,
    );
    expect(isOverdue(eq({ lastMaintenanceDate: null, maintenanceIntervalDays: 30 }), NOW)).toBe(
      false,
    );
  });

  it("daysOverdue: ceil of days past the due date, 0 when not overdue", () => {
    expect(daysOverdue(eq({ lastMaintenanceDate: ago(40), maintenanceIntervalDays: 30 }), NOW)).toBe(
      10,
    );
    expect(daysOverdue(eq({ maintenanceIntervalDays: null }), NOW)).toBe(0);
    // Before the due date the count is clamped to 0 (never negative) — honours
    // the documented contract for the exported, unguarded caller.
    expect(daysOverdue(eq({ lastMaintenanceDate: ago(20), maintenanceIntervalDays: 30 }), NOW)).toBe(
      0,
    );
  });

  it("isSterilizationDue: true when last sterilization is older than 7 days", () => {
    expect(isSterilizationDue(eq({ lastSterilizationDate: ago(10) }), NOW)).toBe(true);
    expect(isSterilizationDue(eq({ lastSterilizationDate: ago(3) }), NOW)).toBe(false);
    expect(isSterilizationDue(eq({ lastSterilizationDate: null }), NOW)).toBe(false);
  });

  it("isInactive: missing lastSeen reads inactive; recent does not; unparseable cannot claim", () => {
    expect(isInactive(eq({ lastSeen: null }), NOW)).toBe(true);
    expect(isInactive(eq({ lastSeen: "" }), NOW)).toBe(true);
    expect(isInactive(eq({ lastSeen: ago(20) }), NOW)).toBe(true);
    expect(isInactive(eq({ lastSeen: ago(3) }), NOW)).toBe(false);
    expect(isInactive(eq({ lastSeen: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("computeAlerts", () => {
  it("uses live status=issue, not stale lastStatus (web parity)", () => {
    const alerts = computeAlerts([eq({ status: "issue" }), eq({ id: "eq-2", status: "ok" })], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "issue",
      severity: "critical",
      equipmentId: "eq-1",
      equipmentName: "Pump",
    });
  });

  it("emits one alert per item with the worst-first precedence", () => {
    // Issue outranks overdue + sterilization + inactive on the same item.
    const worst = eq({
      status: "issue",
      lastMaintenanceDate: ago(90),
      maintenanceIntervalDays: 30,
      lastSterilizationDate: ago(90),
      lastSeen: ago(90),
    });
    expect(computeAlerts([worst], NOW)).toEqual([
      { type: "issue", severity: "critical", equipmentId: "eq-1", equipmentName: "Pump" },
    ]);
  });

  it("derives overdue with daysOverdue, and severity from ALERT_SEVERITY", () => {
    const [alert] = computeAlerts(
      [eq({ lastMaintenanceDate: ago(45), maintenanceIntervalDays: 30 })],
      NOW,
    );
    expect(alert).toMatchObject({ type: "overdue", severity: "high", daysOverdue: 15 });
    expect(ALERT_SEVERITY.overdue).toBe("high");
  });

  it("derives sterilization_due and inactive when nothing higher applies", () => {
    const steril = computeAlerts([eq({ lastSterilizationDate: ago(10) })], NOW);
    expect(steril[0]).toMatchObject({ type: "sterilization_due", severity: "medium" });

    const inactive = computeAlerts([eq({ lastSeen: ago(30) })], NOW);
    expect(inactive[0]).toMatchObject({ type: "inactive", severity: "low" });
  });

  it("emits no alert for a healthy, recently-seen item", () => {
    expect(computeAlerts([eq()], NOW)).toEqual([]);
  });
});

describe("alertTone", () => {
  it("maps type to the semantic chip tone (issue is the never-animated danger fill)", () => {
    expect(alertTone("issue")).toBe("danger");
    expect(alertTone("overdue")).toBe("warning");
    expect(alertTone("sterilization_due")).toBe("warning");
    expect(alertTone("inactive")).toBe("stale");
  });
});

describe("ack join", () => {
  it("alertAckKey + buildAckMap key on equipmentId:alertType", () => {
    const ack: AlertAckInput = { id: "a1", equipmentId: "eq-1", alertType: "issue", ackStatus: "SEEN" };
    const map = buildAckMap([ack]);
    expect(map.get(alertAckKey("eq-1", "issue"))).toBe(ack);
    expect(map.get(alertAckKey("eq-1", "overdue"))).toBeUndefined();
  });
});

describe("deriveAlertsView", () => {
  const equipment: AlertEquipmentInput[] = [
    eq({ id: "sterile", name: "Autoclave", lastSterilizationDate: ago(10) }),
    eq({ id: "issue", name: "Monitor", status: "issue" }),
    eq({ id: "overdue", name: "Drill", lastMaintenanceDate: ago(60), maintenanceIntervalDays: 30 }),
    eq({ id: "stale", name: "Otoscope", lastSeen: ago(30) }),
  ];

  it("sorts worst-first and splits into urgent + maintenance sections", () => {
    const view = deriveAlertsView(equipment, [], NOW);
    expect(view.total).toBe(4);
    expect(view.urgentCount).toBe(2);
    expect(view.sections.map((s) => s.key)).toEqual(["urgent", "maintenance"]);
    // Urgent worst-first: issue before overdue.
    expect(view.sections[0]!.rows.map((r) => r.alert.type)).toEqual(["issue", "overdue"]);
    expect(view.sections[1]!.rows.map((r) => r.alert.type)).toEqual([
      "sterilization_due",
      "inactive",
    ]);
  });

  it("attaches ack state: SEEN → handling, RESOLVED → resolved (never suppressed), none → unclaimed", () => {
    const acks: AlertAckInput[] = [
      { id: "a1", equipmentId: "issue", alertType: "issue", ackStatus: "SEEN" },
      { id: "a2", equipmentId: "overdue", alertType: "overdue", ackStatus: "RESOLVED" },
    ];
    const view = deriveAlertsView(equipment, acks, NOW);
    const byId = new Map(
      view.sections.flatMap((s) => s.rows).map((r) => [r.alert.equipmentId, r]),
    );
    expect(byId.get("issue")!.state).toBe("handling");
    expect(byId.get("overdue")!.state).toBe("resolved");
    expect(byId.get("sterile")!.state).toBe("unclaimed");
    // RESOLVED still counts + renders — web parity (nothing suppressed).
    expect(view.total).toBe(4);
  });

  it("drops empty sections", () => {
    const view = deriveAlertsView([eq({ status: "issue" })], [], NOW);
    expect(view.sections.map((s) => s.key)).toEqual(["urgent"]);
  });

  it("renders honest empty when nothing is derived", () => {
    const view = deriveAlertsView([eq()], [], NOW);
    expect(view.total).toBe(0);
    expect(view.sections).toEqual([]);
  });
});

describe("canManageAlerts (role pre-gate = server senior_technician+ floor)", () => {
  it.each([
    ["admin", true],
    ["vet", true],
    ["senior_technician", true],
    ["lead_technician", false],
    ["technician", false],
    ["vet_tech", false],
    ["student", false],
    [undefined, false],
    [null, false],
  ])("role %s → %s", (role, expected) => {
    expect(canManageAlerts(role as string | undefined | null)).toBe(expected);
  });
});
