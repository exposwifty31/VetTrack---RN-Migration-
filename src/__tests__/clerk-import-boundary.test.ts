/**
 * W-AUTH / PR #75 review — the CLASS guard behind the port-adapter finding:
 * Clerk is an infrastructure concern. Only the auth infrastructure layer (the
 * adapters) may import `@clerk/*`; screens, features, components, hooks and
 * libs consume the Port interfaces (`src/core/ports/*`) instead. This is the
 * repo's hexagonal rule ("auth goes through its Port adapter, never called
 * directly from screens") enforced for the whole tree, not fixed one screen
 * at a time.
 *
 * Scan mechanics: top-level `import`/`export ... from "@clerk/..."` statements
 * (static ESM imports in this codebase are column-0 by prettier). Direction of
 * failure is safe: a real import always matches; a commented mention does not
 * — and a false NEGATIVE here (an exotic dynamic require) still fails loud at
 * review, not silently in the binary.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..");

/** The ONLY places allowed to import @clerk/* (adapters + the app root). */
const ALLOWED = [
  "App.tsx",
  "src/infrastructure/auth/", // adapters (AuthRoot, ClerkTokenBridge, useSignInFlow)
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...walk(join(ROOT, "src")), join(ROOT, "App.tsx")];
const CLERK_IMPORT = /^(import|export)\b[^\n]*\bfrom\s+["']@clerk\//m;

describe("Clerk import boundary", () => {
  it("only the auth infrastructure layer imports @clerk/*", () => {
    const violations = files
      .filter((file) => CLERK_IMPORT.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file))
      .filter((rel) => !ALLOWED.some((allow) => rel === allow || rel.startsWith(allow)));
    expect(violations).toEqual([]);
  });

  it("the allowlist is real — the adapter layer does import @clerk/*", () => {
    // Guards the guard: if the Clerk SDK moved elsewhere wholesale, an empty
    // match set would make the boundary assertion pass vacuously.
    const adapterImports = files
      .map((file) => relative(ROOT, file))
      .filter((rel) => rel.startsWith("src/infrastructure/auth/"))
      .filter((rel) => CLERK_IMPORT.test(readFileSync(join(ROOT, rel), "utf8")));
    expect(adapterImports.length).toBeGreaterThan(0);
  });

  it("exactly one @clerk/* runtime dependency is installed", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const clerkDeps = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@clerk/"));
    expect(clerkDeps).toEqual(["@clerk/expo"]);
  });
});
