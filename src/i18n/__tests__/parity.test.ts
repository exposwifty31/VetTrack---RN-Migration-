import en from "../locales/en.json";
import he from "../locales/he.json";

/**
 * Locale parity — plural-suffix aware (Slice 4).
 *
 * i18next JSON-v4 plural forms (`key_one` / `key_two` / `key_other` …) are
 * REQUIRED to differ per locale: CLDR gives Hebrew {one, two, other} but
 * English only {one, other}, so a raw exact-key-set comparison can never hold
 * for pluralized keys. The mechanism therefore:
 *
 *   1. strips a trailing `_(zero|one|two|few|many|other)` suffix to a BASE key
 *      and requires the base key sets to match exactly across locales;
 *   2. requires each locale to supply EXACTLY the plural categories its
 *      language needs (hardcoded below, cross-checked against the runtime
 *      Intl.PluralRules so ICU drift fails loudly);
 *   3. requires every pluralized base to keep a bare fallback key: i18next's
 *      resolution order is `key_<category>` then the bare `key`, and the bare
 *      key is what renders if the device ICU picks a category the files don't
 *      carry (legacy CLDR gave Hebrew a `many`) or Intl.PluralRules is absent
 *      (Hermes falls back to a one/other dummy rule);
 *   4. stays byte-strict for every non-plural key (unchanged behavior).
 */

const PLURAL_SUFFIX_RE = /^(.+)_(zero|one|two|few|many|other)$/;

/** CLDR cardinal categories each locale must supply (i18next v4 suffixes). */
const REQUIRED_PLURAL_CATEGORIES: Record<string, readonly string[]> = {
  he: ["one", "two", "other"],
  en: ["one", "other"],
};

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    // Skip internal (_-prefixed) segments — vettrack isInternalKey semantics.
    if (key.startsWith("_")) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

type SplitKeys = {
  /** Non-plural-suffixed key paths (includes the bare base of pluralized keys). */
  plain: string[];
  /** Base key path → sorted plural categories supplied for it. */
  pluralForms: Map<string, string[]>;
};

function splitPluralKeys(paths: string[]): SplitKeys {
  const plain: string[] = [];
  const pluralForms = new Map<string, string[]>();
  for (const path of paths) {
    const segments = path.split(".");
    const match = PLURAL_SUFFIX_RE.exec(segments[segments.length - 1]!);
    if (match) {
      const base = [...segments.slice(0, -1), match[1]!].join(".");
      pluralForms.set(base, [...(pluralForms.get(base) ?? []), match[2]!].sort());
    } else {
      plain.push(path);
    }
  }
  return { plain: plain.sort(), pluralForms };
}

const heSplit = splitPluralKeys(flattenKeys(he as Record<string, unknown>));
const enSplit = splitPluralKeys(flattenKeys(en as Record<string, unknown>));

describe("i18n parity", () => {
  it("he and en have identical non-plural key sets", () => {
    expect(heSplit.plain).toEqual(enSplit.plain);
  });

  it("he and en pluralize the same base keys", () => {
    expect([...heSplit.pluralForms.keys()].sort()).toEqual(
      [...enSplit.pluralForms.keys()].sort(),
    );
  });

  it("each locale supplies exactly its language's required plural categories", () => {
    for (const [locale, split] of [
      ["he", heSplit],
      ["en", enSplit],
    ] as const) {
      const required = [...REQUIRED_PLURAL_CATEGORIES[locale]!].sort();
      for (const [base, categories] of split.pluralForms) {
        expect({ locale, base, categories }).toEqual({ locale, base, categories: required });
      }
    }
  });

  it("every pluralized base keeps a bare fallback key (i18next bare-key fallback)", () => {
    for (const split of [heSplit, enSplit]) {
      for (const base of split.pluralForms.keys()) {
        expect(split.plain).toContain(base);
      }
    }
  });

  it("hardcoded required categories match the runtime Intl.PluralRules (ICU drift guard)", () => {
    for (const [locale, required] of Object.entries(REQUIRED_PLURAL_CATEGORIES)) {
      const runtime = [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories].sort();
      expect({ locale, categories: runtime }).toEqual({
        locale,
        categories: [...required].sort(),
      });
    }
  });

  it("has no empty string values", () => {
    const walk = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("_")) continue;
        if (value && typeof value === "object") walk(value as Record<string, unknown>);
        else expect(String(value).length).toBeGreaterThan(0);
      }
    };
    walk(he as Record<string, unknown>);
    walk(en as Record<string, unknown>);
  });
});
