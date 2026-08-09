import { decodeJwtPayload } from "../auth-fetch";
import {
  DEV_PLACEHOLDER_BEARER,
  isDevAuthFlagEnabled,
  placeholderSatisfiesJwtShapeGate,
  resolveDevAuth,
} from "../dev-auth";

const CLERK_KEY = "pk_test_example";

describe("isDevAuthFlagEnabled", () => {
  it.each(["1", "true", "TRUE", "  true  "])("treats %p as enabled", (raw) => {
    expect(isDevAuthFlagEnabled(raw)).toBe(true);
  });

  it.each([undefined, "", "  ", "0", "false", "yes", "on"])(
    "treats %p as disabled, so only an explicit opt-in turns the seam on",
    (raw) => {
      expect(isDevAuthFlagEnabled(raw)).toBe(false);
    },
  );
});

describe("resolveDevAuth", () => {
  it("installs when the build is dev, the flag is on, and no Clerk key is configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devAuthFlag: "1", clerkPublishableKey: undefined }),
    ).toEqual({ installed: true });
  });

  it("refuses in a release build even when the flag is on", () => {
    expect(
      resolveDevAuth({ isDev: false, devAuthFlag: "1", clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "release-build" });
  });

  it("stays inert when the flag is absent", () => {
    expect(
      resolveDevAuth({ isDev: true, devAuthFlag: undefined, clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "not-enabled" });
  });

  it("refuses when a Clerk publishable key is configured, so a build with a real auth path never carries a fallback", () => {
    expect(
      resolveDevAuth({ isDev: true, devAuthFlag: "1", clerkPublishableKey: CLERK_KEY }),
    ).toEqual({ installed: false, reason: "clerk-configured" });
  });

  it("ignores a whitespace-only Clerk key rather than treating it as configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devAuthFlag: "true", clerkPublishableKey: "  " }),
    ).toEqual({ installed: true });
  });

  it("checks the release gate before the flag, so a release build never reports a flag-shaped reason", () => {
    expect(
      resolveDevAuth({ isDev: false, devAuthFlag: undefined, clerkPublishableKey: CLERK_KEY }),
    ).toEqual({ installed: false, reason: "release-build" });
  });
});

describe("DEV_PLACEHOLDER_BEARER", () => {
  it("satisfies authFetch's JWT-shape gate, which is the only reason it exists", () => {
    expect(placeholderSatisfiesJwtShapeGate()).toBe(true);
  });

  it("names itself a placeholder rather than identifying a principal, read through the app's own JWT decoder", () => {
    expect(decodeJwtPayload(DEV_PLACEHOLDER_BEARER)).toEqual({
      sub: "dev-bypass-placeholder",
      note: "not-a-credential",
    });
  });

  it("declares alg:none, so it advertises that it is not cryptographically signed", () => {
    // base64url of {"alg":"none","typ":"JWT"} — pinned as a literal because the
    // repo has no @types/node, so the test cannot reach for Buffer to decode it.
    expect(DEV_PLACEHOLDER_BEARER.split(".")[0]).toBe("eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0");
  });
});
