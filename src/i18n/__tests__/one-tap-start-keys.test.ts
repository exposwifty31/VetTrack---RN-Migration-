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
const REQUIRED_ERROR_KEYS = [
  "startPending",
  "startSuperseded",
  "startInvalidManager",
] as const;

describe.each([
  ["en", en],
  ["he", he],
] as const)("codeBlue.errors one-tap keys (%s)", (_locale, bundle) => {
  const errors = (bundle as { codeBlue?: { errors?: Record<string, string> } }).codeBlue?.errors;

  it.each(REQUIRED_ERROR_KEYS.map((k) => [k]))("has non-empty %s", (key) => {
    expect(typeof errors?.[key]).toBe("string");
    expect((errors?.[key] ?? "").trim().length).toBeGreaterThan(0);
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
