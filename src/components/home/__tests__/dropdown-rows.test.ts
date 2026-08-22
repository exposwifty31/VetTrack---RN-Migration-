/**
 * The bell opens a dropdown of the few most recent alerts with a footer link to
 * the full list — it does NOT navigate straight to the alerts page. Requested
 * four times before it landed; it kept being verified against the WEB app,
 * where `alerts-dropdown.tsx` has existed all along, while the RN top bar still
 * called `navigate("Alerts")`.
 *
 * `deriveAlertsView` already sorts worst-first and splits into urgent /
 * maintenance sections. The dropdown must preserve that ordering across the
 * section boundary — urgent rows first — rather than re-sorting or showing
 * whichever section happens to come first with rows in it.
 */
import type { AlertsView, AlertViewRow } from "@/lib/alerts-derive";

import { DROPDOWN_ALERT_LIMIT, selectDropdownAlerts } from "../dropdown-rows";

function row(equipmentId: string, severity: "critical" | "low"): AlertViewRow {
  return {
    alert: { type: "inactive", severity, equipmentId, equipmentName: equipmentId },
    ack: null,
    state: "unclaimed",
  };
}

function view(urgent: AlertViewRow[], maintenance: AlertViewRow[]): AlertsView {
  const sections = [];
  if (urgent.length) sections.push({ key: "urgent" as const, rows: urgent });
  if (maintenance.length) sections.push({ key: "maintenance" as const, rows: maintenance });
  return { sections, total: urgent.length + maintenance.length, urgentCount: urgent.length };
}

describe("selectDropdownAlerts", () => {
  it("caps the list at five so the dropdown never becomes a second alerts page", () => {
    const many = Array.from({ length: 12 }, (_, i) => row(`eq-${i}`, "low"));

    expect(selectDropdownAlerts(view([], many))).toHaveLength(DROPDOWN_ALERT_LIMIT);
  });

  it("keeps urgent rows ahead of maintenance rows across the section boundary", () => {
    const result = selectDropdownAlerts(view([row("urgent-1", "critical")], [row("maint-1", "low")]));

    expect(result.map((r) => r.alert.equipmentId)).toEqual(["urgent-1", "maint-1"]);
  });

  it("drops maintenance entirely when urgent alone fills the cap", () => {
    const urgent = Array.from({ length: 6 }, (_, i) => row(`u-${i}`, "critical"));
    const result = selectDropdownAlerts(view(urgent, [row("maint-1", "low")]));

    expect(result).toHaveLength(DROPDOWN_ALERT_LIMIT);
    expect(result.map((r) => r.alert.equipmentId)).not.toContain("maint-1");
  });

  it("returns an empty list when there are no alerts, so the caller can show its empty state", () => {
    expect(selectDropdownAlerts(view([], []))).toEqual([]);
  });
});
