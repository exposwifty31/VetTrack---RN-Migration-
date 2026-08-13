import en from "../locales/en.json";
import he from "../locales/he.json";

/**
 * Doctor shift gate i18n contract (doctor-shift-gate plan, Task 2).
 *
 * Both locales must carry the full `doctorGate` key set, including the keys the
 * vettrack client added during review (end-shift confirm dialog) and the
 * generic replace-senior body used when SENIOR_ALREADY_ASSIGNED arrives with
 * `currentSeniorName: null` (race path). Interpolated keys use i18next
 * `{{var}}` syntax.
 */

const REQUIRED_KEYS = [
  "areYouOnShift",
  "yes",
  "no",
  "pickTeam",
  "teamIcu",
  "teamAdmission",
  "teamInternalMedicine",
  "iAmSenior",
  "replaceSeniorTitle",
  "replaceSeniorBody",
  "replaceSeniorBodyGeneric",
  "replace",
  "cancel",
  "onShiftStatus",
  "onShiftSenior",
  "endShift",
  "endShiftConfirmTitle",
  "endShiftConfirmBody",
  "switchRole",
  "checkInFailed",
] as const;

/** key → i18next interpolation variables it must reference in BOTH locales. */
const REQUIRED_INTERPOLATIONS: Record<string, readonly string[]> = {
  replaceSeniorBody: ["name", "team"],
  replaceSeniorBodyGeneric: ["team"],
  onShiftStatus: ["team"],
};

describe.each([
  ["en", en],
  ["he", he],
] as const)("doctorGate keys (%s)", (_locale, bundle) => {
  const doctorGate = (bundle as Record<string, unknown>).doctorGate as
    | Record<string, string>
    | undefined;

  it("has a doctorGate namespace", () => {
    expect(doctorGate).toBeDefined();
  });

  it.each(REQUIRED_KEYS.map((k) => [k]))("has non-empty %s", (key) => {
    expect(typeof doctorGate?.[key]).toBe("string");
    expect((doctorGate?.[key] ?? "").length).toBeGreaterThan(0);
  });

  it.each(Object.entries(REQUIRED_INTERPOLATIONS))(
    "%s carries its {{var}} interpolations",
    (key, vars) => {
      for (const v of vars) {
        expect(doctorGate?.[key]).toContain(`{{${v}}}`);
      }
    },
  );

  it("the generic replace body does NOT reference {{name}}", () => {
    expect(doctorGate?.replaceSeniorBodyGeneric ?? "").not.toContain("{{name}}");
  });
});
