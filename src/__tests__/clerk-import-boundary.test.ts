/**
 * W-AUTH / PR #75 review — the CLASS guard behind the port-adapter finding:
 * Clerk is an infrastructure concern. Only the auth infrastructure layer (the
 * adapters) may import `@clerk/*`; screens, features, components, hooks and
 * libs consume the Port interfaces (`src/core/ports/*`) instead. This is the
 * repo's hexagonal rule ("auth goes through its Port adapter, never called
 * directly from screens") enforced for the whole tree, not fixed one screen
 * at a time.
 *
 * Detection is PARSED, never grepped (CodeRabbit round 2; vettrack
 * xlsx-write-only-guard precedent): module specifiers are collected from the
 * TypeScript AST — static import/export declarations, `import type`
 * ImportTypeNodes, dynamic `import(...)`, and `require(...)` — so a dynamic
 * require is caught and a commented-out import line is ignored. Verified
 * red/green at introduction: a planted `require("@clerk/expo")` in a screen
 * failed the suite; a planted block-comment import did not.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import ts from "typescript";

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

/**
 * Every module specifier reached by real module syntax in `source` — the
 * shapes a raw-text scan gets wrong in both directions.
 */
function moduleSpecifiersOf(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const lit = (n: ts.Node | undefined): string | undefined =>
    n && ts.isStringLiteralLike(n) ? n.text : undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = lit(node.moduleSpecifier);
      if (spec !== undefined) specifiers.push(spec);
    } else if (ts.isImportTypeNode(node)) {
      // import("mod") in TYPE position: typeof import("@clerk/expo")
      if (ts.isLiteralTypeNode(node.argument)) {
        const spec = lit(node.argument.literal);
        if (spec !== undefined) specifiers.push(spec);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if (isDynamicImport || isRequire) {
        const spec = lit(node.arguments[0]);
        if (spec !== undefined) specifiers.push(spec);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specifiers;
}

function importsClerk(file: string): boolean {
  const source = readFileSync(file, "utf8");
  return moduleSpecifiersOf(source, file).some((spec) => spec.startsWith("@clerk/"));
}

const files = [...walk(join(ROOT, "src")), join(ROOT, "App.tsx")];

describe("Clerk import boundary", () => {
  it("only the auth infrastructure layer imports @clerk/*", () => {
    const violations = files
      .filter((file) => importsClerk(file))
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
      .filter((rel) => importsClerk(join(ROOT, rel)));
    expect(adapterImports.length).toBeGreaterThan(0);
  });

  it("exactly one @clerk/* runtime dependency is installed", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const clerkDeps = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@clerk/"));
    expect(clerkDeps).toEqual(["@clerk/expo"]);
  });

  it("the parser sees through the shapes a raw-text scan gets wrong (both directions)", () => {
    // A dynamic require and a dynamic import ARE detected...
    expect(
      moduleSpecifiersOf('const m = require("@clerk/expo");', "plant-require.ts"),
    ).toContain("@clerk/expo");
    expect(
      moduleSpecifiersOf('void import("@clerk/expo/token-cache");', "plant-dynamic.ts"),
    ).toContain("@clerk/expo/token-cache");
    expect(
      moduleSpecifiersOf('type T = typeof import("@clerk/expo");', "plant-type.ts"),
    ).toContain("@clerk/expo");
    // ...while a commented-out import is NOT.
    expect(
      moduleSpecifiersOf(
        '/* import { useAuth } from "@clerk/expo"; */\n// import x from "@clerk/expo";\nexport {};',
        "plant-comment.ts",
      ),
    ).toEqual([]);
  });
});
