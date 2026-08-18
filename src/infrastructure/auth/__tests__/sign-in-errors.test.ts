/**
 * W-AUTH PR-B: mapping the v4 `errors.fields` surface to field-level display
 * decisions. The mapper answers only WHICH field errored — the screen renders
 * its own localized copy; the provider's `message`/`longMessage` are never
 * part of the return value, so raw authorization internals cannot leak into
 * the render path through this seam.
 */
import { resolveSignInFieldErrors } from "../sign-in-errors";

const fieldError = (code: string) => ({
  code,
  message: `raw provider message for ${code}`,
});

describe("resolveSignInFieldErrors", () => {
  it("flags the identifier field when it carries an error", () => {
    const result = resolveSignInFieldErrors({
      fields: { identifier: fieldError("form_identifier_not_found"), password: null },
      raw: null,
      global: null,
    });
    expect(result).toEqual({ identifier: true, password: false });
  });

  it("flags the password field when it carries an error", () => {
    const result = resolveSignInFieldErrors({
      fields: { identifier: null, password: fieldError("form_password_incorrect") },
      raw: null,
      global: null,
    });
    expect(result).toEqual({ identifier: false, password: true });
  });

  it("returns all-false for a clean errors object", () => {
    const result = resolveSignInFieldErrors({
      fields: { identifier: null, password: null },
      raw: null,
      global: null,
    });
    expect(result).toEqual({ identifier: false, password: false });
  });

  it("returns all-false for an absent errors surface (SDK not loaded yet)", () => {
    expect(resolveSignInFieldErrors(undefined)).toEqual({ identifier: false, password: false });
    expect(resolveSignInFieldErrors(null)).toEqual({ identifier: false, password: false });
  });
});
