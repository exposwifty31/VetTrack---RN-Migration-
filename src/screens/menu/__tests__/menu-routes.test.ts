/**
 * Menu route-map tests (Slice 12). The map is compile-checked at the type level
 * (`satisfies readonly MenuEntry[]` forces every `route` to be a param-free
 * root-stack route); these runtime assertions lock the CONTENT: the Operations
 * set, the Session entry, and — critically — that EVERY debug screen from the
 * old debug-launcher Menu is preserved under Developer (nothing was deleted).
 */
import {
  CUSTODY_HIDDEN_ROUTE,
  DEVELOPER_ENTRIES,
  OPERATIONS_ENTRIES,
  SESSION_ENTRIES,
  computeDeveloperEntries,
  visibleOperationsEntries,
} from "../menu-routes";

const routesOf = (entries: readonly { route: string }[]) => entries.map((e) => e.route);

describe("menu route map", () => {
  it("Operations links the six daily-driver surfaces (param-free only)", () => {
    expect(routesOf(OPERATIONS_ENTRIES)).toEqual([
      "Tasks",
      "Rooms",
      "MyEquipment",
      "Alerts",
      "Inventory",
      "AutopilotQueue",
    ]);
  });

  it("Session ends the shift via Handoff", () => {
    expect(SESSION_ENTRIES).toEqual([{ route: "Handoff", labelKey: "menu.endShift" }]);
  });

  describe("computeDeveloperEntries — no dev tools reach a real release build", () => {
    const DEBUG_LAUNCHERS = ["SignIn", "ApiSmoke", "NfcSpike", "StorageDebug", "RealtimeDebug", "I18nDebug"];

    it("a real release (no __DEV__, measure flag off) exposes NO developer tools", () => {
      expect(computeDeveloperEntries({ isDev: false, measureEnabled: false })).toEqual([]);
    });

    it("a dev build exposes the six debug launchers (SignIn + the five debug screens)", () => {
      expect(routesOf(computeDeveloperEntries({ isDev: true, measureEnabled: false }))).toEqual(
        DEBUG_LAUNCHERS,
      );
    });

    it("a measurement release (flag on) reaches ONLY G2Measure — the G3 exit-pass path survives", () => {
      expect(computeDeveloperEntries({ isDev: false, measureEnabled: true })).toEqual([
        { route: "G2Measure", labelKey: "nav.g2Measure" },
      ]);
    });

    it("a dev build with the measure flag shows the launchers and G2Measure", () => {
      expect(routesOf(computeDeveloperEntries({ isDev: true, measureEnabled: true }))).toEqual([
        ...DEBUG_LAUNCHERS,
        "G2Measure",
      ]);
    });

    it("the runtime DEVELOPER_ENTRIES reflects the jest context (__DEV__ true, flag unset)", () => {
      expect(routesOf(DEVELOPER_ENTRIES)).toEqual(DEBUG_LAUNCHERS);
    });
  });

  it("never routes to an id-parameterised screen from the Menu", () => {
    const all = routesOf([...OPERATIONS_ENTRIES, ...SESSION_ENTRIES, ...DEVELOPER_ENTRIES]);
    expect(all).not.toContain("EquipmentDetail");
    expect(all).not.toContain("RoomDetail");
  });

  it("has unique routes and non-empty label keys throughout", () => {
    const all = [...OPERATIONS_ENTRIES, ...SESSION_ENTRIES, ...DEVELOPER_ENTRIES];
    const routes = all.map((e) => e.route);
    expect(new Set(routes).size).toBe(routes.length);
    for (const entry of all) {
      expect(entry.labelKey.length).toBeGreaterThan(0);
    }
  });

  it("hides only the Mine entry for custody-scoped roles, keeps everything else", () => {
    expect(CUSTODY_HIDDEN_ROUTE).toBe("MyEquipment");

    for (const role of ["student", "viewer", " Student ", "VIEWER"]) {
      const visible = routesOf(visibleOperationsEntries(role));
      // Omits ONLY MyEquipment — every other Operations entry survives, in order.
      expect(visible).toEqual(["Tasks", "Rooms", "Alerts", "Inventory", "AutopilotQueue"]);
      expect(visible).not.toContain("MyEquipment");
      const omitted = routesOf(OPERATIONS_ENTRIES).filter((r) => !visible.includes(r));
      expect(omitted).toEqual(["MyEquipment"]);
    }
  });

  it("keeps the full Operations set (incl. MyEquipment) for unrestricted and unresolved roles", () => {
    for (const role of ["admin", "vet", "senior_technician", "technician", "vet_tech", "", undefined, null]) {
      expect(visibleOperationsEntries(role)).toEqual(OPERATIONS_ENTRIES);
      expect(routesOf(visibleOperationsEntries(role))).toContain("MyEquipment");
    }
  });
});
