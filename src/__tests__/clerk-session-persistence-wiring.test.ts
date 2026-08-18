/**
 * W-AUTH contract pin: session persistence depends on App.tsx mounting
 * ClerkProvider with BOTH `publishableKey` and the SecureStore-backed
 * `tokenCache` from the Clerk package's `/token-cache` subpath. Losing either
 * is invisible to typecheck (both props are optional in some SDK lines) and
 * only shows up on-device as "signed out after every restart".
 *
 * Package-name agnostic on purpose: it derives the Clerk package from
 * package.json, so it survives the @clerk/clerk-expo -> @clerk/expo rename and
 * still fails if the token cache is dropped during the migration.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const appSource = readFileSync(join(root, "App.tsx"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

const clerkPkg = Object.keys(pkg.dependencies).find((name) => name.startsWith("@clerk/"));

describe("Clerk session-persistence wiring (App.tsx)", () => {
  it("has exactly one @clerk/* runtime dependency", () => {
    const all = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@clerk/"));
    expect(all).toHaveLength(1);
  });

  it("imports ClerkProvider from the Clerk package root", () => {
    expect(clerkPkg).toBeDefined();
    const importRe = new RegExp(
      `import\\s*\\{[^}]*\\bClerkProvider\\b[^}]*\\}\\s*from\\s*"${clerkPkg}"`,
    );
    expect(appSource).toMatch(importRe);
  });

  it("imports tokenCache from the Clerk token-cache subpath", () => {
    const importRe = new RegExp(
      `import\\s*\\{[^}]*\\btokenCache\\b[^}]*\\}\\s*from\\s*"${clerkPkg}/token-cache"`,
    );
    expect(appSource).toMatch(importRe);
  });

  it("mounts ClerkProvider with publishableKey AND tokenCache", () => {
    const providerOpen = appSource.match(/<ClerkProvider\b[^>]*>/s)?.[0];
    expect(providerOpen).toBeDefined();
    expect(providerOpen).toContain("publishableKey={publishableKey}");
    expect(providerOpen).toContain("tokenCache={tokenCache}");
  });
});
