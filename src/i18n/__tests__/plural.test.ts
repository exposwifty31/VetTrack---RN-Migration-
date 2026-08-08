/**
 * Runtime plural resolution — proves i18next (26.x, Intl.PluralRules-driven)
 * picks the correct suffixed form for the Slice-4 count-bearing keys in BOTH
 * locales at counts 1 / 2 / 3: Hebrew resolves `_one` / `_two` / `_other`,
 * English `_one` / `_other` / `_other`. Expected strings come from the locale
 * JSON itself (no copy duplication) so the test locks FORM SELECTION, plus two
 * literal spot checks that would catch a he/en resource wiring inversion.
 */
import en from "../locales/en.json";
import he from "../locales/he.json";

import { i18n } from "../config";

// The storage port hits the MMKV native module, absent under jest — mock the
// safe-storage helpers so ../config's locale resolution never touches it.
// jest.mock is hoisted above the imports, so the mock applies before init.
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

/** checkedOutCount + the six count-bearing debt keys (badges carry no count). */
const PLURAL_KEYS = [
  "myEquipment.checkedOutCount",
  "myEquipment.debt.bannerCheckedOutLong",
  "myEquipment.debt.bannerVeryStale",
  "myEquipment.debt.bannerStale",
  "myEquipment.debt.breakdownCheckedOutLong",
  "myEquipment.debt.breakdownVeryStale",
  "myEquipment.debt.breakdownStale",
] as const;

function lookup(resources: Record<string, unknown>, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>((node, segment) => (node as Record<string, unknown>)[segment], resources);
  if (typeof value !== "string") throw new Error(`Missing locale string at ${path}`);
  return value;
}

const interpolate = (template: string, count: number): string =>
  template.replace("{{count}}", String(count));

describe("plural form selection (counts 1 / 2 / 3, both locales)", () => {
  const tHe = i18n.getFixedT("he");
  const tEn = i18n.getFixedT("en");

  it.each(PLURAL_KEYS)("he resolves _one/_two/_other for %s", (key) => {
    expect(tHe(key, { count: 1 })).toBe(lookup(he, `${key}_one`));
    expect(tHe(key, { count: 2 })).toBe(lookup(he, `${key}_two`));
    expect(tHe(key, { count: 3 })).toBe(interpolate(lookup(he, `${key}_other`), 3));
  });

  it.each(PLURAL_KEYS)("en resolves _one/_other/_other for %s", (key) => {
    expect(tEn(key, { count: 1 })).toBe(lookup(en, `${key}_one`));
    expect(tEn(key, { count: 2 })).toBe(interpolate(lookup(en, `${key}_other`), 2));
    expect(tEn(key, { count: 3 })).toBe(interpolate(lookup(en, `${key}_other`), 3));
  });

  it("spot check: the dual form is a real Hebrew dual, not an interpolation", () => {
    expect(tHe("myEquipment.checkedOutCount", { count: 2 })).toBe("שני פריטים מושאלים");
    expect(tEn("myEquipment.checkedOutCount", { count: 1 })).toBe("1 checked out");
  });
});

/**
 * `shiftChat.online` is count-bearing ("Online: {{count}}"). Its copy is identical
 * across plural forms (the format carries no grammatical singular/plural), so a
 * runtime-only assertion would pass via i18next's bare-key fallback even if the
 * plural resources were removed. The STRUCTURAL checks below lock the resources'
 * presence per locale's CLDR categories; the runtime checks prove clean {{count}}
 * interpolation at singular / dual / plural counts.
 */
describe("shiftChat.online plural resource", () => {
  const tHe = i18n.getFixedT("he");
  const tEn = i18n.getFixedT("en");

  it("defines en's {one, other} forms plus the bare fallback", () => {
    expect(en.shiftChat).toHaveProperty("online");
    expect(en.shiftChat).toHaveProperty("online_one");
    expect(en.shiftChat).toHaveProperty("online_other");
  });

  it("defines he's {one, two, other} forms plus the bare fallback", () => {
    expect(he.shiftChat).toHaveProperty("online");
    expect(he.shiftChat).toHaveProperty("online_one");
    expect(he.shiftChat).toHaveProperty("online_two");
    expect(he.shiftChat).toHaveProperty("online_other");
  });

  it("resolves a count-bearing string at 1 / 2 / 3 in both locales", () => {
    for (const count of [1, 2, 3]) {
      expect(tHe("shiftChat.online", { count })).toBe(`מחוברים: ${count}`);
      expect(tEn("shiftChat.online", { count })).toBe(`Online: ${count}`);
    }
  });
});
