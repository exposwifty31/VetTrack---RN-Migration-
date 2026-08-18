/**
 * W3a / SignInScreen hardening: the sign-in surface shipped server-authorization
 * internals to end users — the `azpNote` debug strings and the `missingKey` copy
 * both named `azp` and `resolveClerkAuthorizedParties`. This data-guard pins that
 * NO user-facing `signIn.*` string in either locale discloses those internals.
 */
import en from "@/i18n/locales/en.json";
import he from "@/i18n/locales/he.json";

const FORBIDDEN = ["resolveClerkAuthorizedParties", "azp"];

function signInStrings(dict: Record<string, unknown>): string[] {
  const block = (dict.signIn ?? {}) as Record<string, string>;
  return Object.values(block);
}

describe.each([
  ["en", en as Record<string, unknown>],
  ["he", he as Record<string, unknown>],
])("signIn copy discloses no server-authorization internals (%s)", (_locale, dict) => {
  const strings = signInStrings(dict);

  it("has a signIn block with copy", () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("contains no %s", (token) => {
    for (const value of strings) {
      expect(value.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("defines a generic signIn.error message", () => {
    expect(typeof (dict.signIn as Record<string, string>).error).toBe("string");
    expect((dict.signIn as Record<string, string>).error.length).toBeGreaterThan(0);
  });
});
