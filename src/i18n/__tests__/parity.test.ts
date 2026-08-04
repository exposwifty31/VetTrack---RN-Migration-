import en from "../locales/en.json";
import he from "../locales/he.json";

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

describe("i18n parity", () => {
  it("he and en have identical key sets", () => {
    const heKeys = flattenKeys(he as Record<string, unknown>);
    const enKeys = flattenKeys(en as Record<string, unknown>);
    expect(heKeys).toEqual(enKeys);
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
