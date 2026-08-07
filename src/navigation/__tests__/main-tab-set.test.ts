/**
 * Tab-set-by-role derivation — locks the custody-scoped swap (web NativeTabBar
 * parity: student gets Mine INSTEAD of Emergency; everyone else keeps the
 * standard bar) and the exactly-one-of-Emergency|Mine invariant.
 */
import { deriveMainTabSet, isCustodyScopedRole } from "../main-tab-set";

describe("isCustodyScopedRole", () => {
  it("matches student and its legacy viewer alias, normalized", () => {
    expect(isCustodyScopedRole("student")).toBe(true);
    expect(isCustodyScopedRole("viewer")).toBe(true);
    expect(isCustodyScopedRole(" Student ")).toBe(true);
    expect(isCustodyScopedRole("VIEWER")).toBe(true);
  });

  it("rejects every non-custody role and unresolved values", () => {
    for (const role of [
      "admin",
      "vet",
      "senior_technician",
      "lead_technician",
      "technician",
      "vet_tech",
      "",
      undefined,
      null,
    ]) {
      expect(isCustodyScopedRole(role)).toBe(false);
    }
  });
});

describe("deriveMainTabSet", () => {
  it("gives custody-scoped roles Mine instead of Emergency", () => {
    expect(deriveMainTabSet("student")).toEqual(["Today", "EquipmentTab", "Mine", "Menu"]);
    expect(deriveMainTabSet("viewer")).toEqual(["Today", "EquipmentTab", "Mine", "Menu"]);
  });

  it("gives every other role the standard Emergency bar", () => {
    for (const role of ["admin", "vet", "senior_technician", "technician", "vet_tech"]) {
      expect(deriveMainTabSet(role)).toEqual(["Today", "EquipmentTab", "Emergency", "Menu"]);
    }
  });

  it("derives the standard (pre-Slice-4) bar while identity is unresolved", () => {
    expect(deriveMainTabSet(undefined)).toEqual(["Today", "EquipmentTab", "Emergency", "Menu"]);
    expect(deriveMainTabSet(null)).toEqual(["Today", "EquipmentTab", "Emergency", "Menu"]);
    expect(deriveMainTabSet("")).toEqual(["Today", "EquipmentTab", "Emergency", "Menu"]);
  });

  it("always yields 4 tabs with exactly one of Emergency | Mine", () => {
    for (const role of ["student", "viewer", "admin", "technician", undefined]) {
      const tabs = deriveMainTabSet(role);
      expect(tabs).toHaveLength(4);
      const fourth = tabs.filter((name) => name === "Emergency" || name === "Mine");
      expect(fourth).toHaveLength(1);
      expect(tabs[0]).toBe("Today");
      expect(tabs[1]).toBe("EquipmentTab");
      expect(tabs[3]).toBe("Menu");
    }
  });
});
