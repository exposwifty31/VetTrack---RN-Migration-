/**
 * Locks the row's status-line derivation (extracted with the Aurora restyle):
 * custody drives the tier — available (success), held with a holder email
 * (warning + LTR email), held anonymous (warning).
 */
import { equipmentRowStatus } from "../equipment-row-status";

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
