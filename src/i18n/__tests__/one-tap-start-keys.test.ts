import en from "../locales/en.json";
import he from "../locales/he.json";

/**
 * J1 — copy contract for the one-tap start errors.
 *
 * `parity.test.ts` guarantees the two locales carry the SAME key set; it cannot
 * guarantee the keys exist at all, nor that the three 409 reasons say three
 * different things. Both matter here: the whole reason RN moves off
 * `POST /sessions` is that its single opaque 409 could not tell an operator
 * whether to wait, to join, or to stop — so rendering one string for all three
 * would reintroduce the defect at the copy layer.
 */
/**
 * EVERY error key this cohort introduced, not just the one-tap three.
 * `parity.test.ts` only equalizes the two bundles — a key deleted from BOTH
 * passes parity, and the banner then renders the raw key string mid-arrest.
 */
const REQUIRED_ERROR_KEYS = [
  "startPending",
  "startSuperseded",
  "invalidManager",
  "notClinical",
  "managerOnly",
  "managerNoLongerEligible",
  "managerNotEligible",
  "conflict",
] as const;

/** The manager-picker copy the nomination path cannot render without. */
const REQUIRED_ACTION_KEYS = [
  "startNotEligible",
  "pickManager",
  "pickManagerHint",
  "pickManagerConsequence",
  "managersLoading",
  "managersEmpty",
  "managersLoadError",
] as const;

describe.each([
  ["en", en],
  ["he", he],
] as const)("codeBlue.errors one-tap keys (%s)", (_locale, bundle) => {
  const errors = (bundle as { codeBlue?: { errors?: Record<string, string> } }).codeBlue?.errors;

  const actions = (bundle as { codeBlue?: { actions?: Record<string, string> } }).codeBlue?.actions;

  it.each(REQUIRED_ERROR_KEYS.map((k) => [k]))("has non-empty errors.%s", (key) => {
    expect(typeof errors?.[key]).toBe("string");
    expect((errors?.[key] ?? "").trim().length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_ACTION_KEYS.map((k) => [k]))("has non-empty actions.%s", (key) => {
    expect(typeof actions?.[key]).toBe("string");
    expect((actions?.[key] ?? "").trim().length).toBeGreaterThan(0);
  });

  it("the three start-conflict strings are all DISTINCT (no silent collapse)", () => {
    const strings = ["conflict", "startPending", "startSuperseded"].map((k) => errors?.[k]);
    expect(new Set(strings).size).toBe(3);
  });
});

describe("Hebrew one-tap copy is actually Hebrew", () => {
  const heErrors = (he as { codeBlue?: { errors?: Record<string, string> } }).codeBlue?.errors;

  it.each(REQUIRED_ERROR_KEYS.map((k) => [k]))("%s contains Hebrew letters, not an en fallback", (key) => {
    expect(heErrors?.[key] ?? "").toMatch(/[א-ת]/);
  });

  it.each(REQUIRED_ERROR_KEYS.map((k) => [k]))("%s is not byte-identical to the English string", (key) => {
    const enErrors = (en as { codeBlue?: { errors?: Record<string, string> } }).codeBlue?.errors;
    expect(heErrors?.[key]).not.toBe(enErrors?.[key]);
  });
});
