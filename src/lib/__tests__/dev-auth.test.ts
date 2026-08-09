import { resolveDevAuth } from "../dev-auth";

const VALID = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYifQ.signature";
const CLERK_KEY = "pk_test_example";

describe("resolveDevAuth", () => {
  it("installs when the build is dev, a token is set, and no Clerk key is configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: VALID, clerkPublishableKey: undefined }),
    ).toEqual({ installed: true });
  });

  it("refuses in a release build even when a token is present", () => {
    expect(
      resolveDevAuth({ isDev: false, devToken: VALID, clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "release-build" });
  });

  it("stays inert when no dev token is configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: undefined, clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "not-configured" });
  });

  it("treats a blank or whitespace-only token as not configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: "   ", clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "not-configured" });
  });

  it("refuses when a Clerk publishable key is configured, so a build with a real auth path never carries a fallback token", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: VALID, clerkPublishableKey: CLERK_KEY }),
    ).toEqual({ installed: false, reason: "clerk-configured" });
  });

  it("ignores a whitespace-only Clerk key rather than treating it as configured", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: VALID, clerkPublishableKey: "  " }),
    ).toEqual({ installed: true });
  });

  it("rejects a token that is not a 3-segment JWT instead of storing something authFetch will reject", () => {
    expect(
      resolveDevAuth({ isDev: true, devToken: "not-a-jwt", clerkPublishableKey: undefined }),
    ).toEqual({ installed: false, reason: "malformed-token" });
  });

  it("checks the release gate before the token, so a release build never reports a token-shaped reason", () => {
    expect(
      resolveDevAuth({ isDev: false, devToken: "not-a-jwt", clerkPublishableKey: CLERK_KEY }),
    ).toEqual({ installed: false, reason: "release-build" });
  });
});
