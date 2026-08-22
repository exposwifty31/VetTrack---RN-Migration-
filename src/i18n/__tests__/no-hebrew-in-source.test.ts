/**
 * User-facing Hebrew belongs in `src/i18n/locales/*.json`, never in a source
 * file. A literal in code cannot be translated, cannot be checked for parity
 * against `en.json`, and ships to an English user as Hebrew.
 *
 * WHAT THIS SCANS, AND WHY IT IS NOT A GLYPH COUNT.
 * Hebrew in COMMENTS is idiomatic here and harmless — 17 production files
 * document themselves with Hebrew prose ("אי זכוכית צף", tab names, date-format
 * examples). A naive glyph scan flags all of them, forcing an allowlist that
 * teaches nothing and gets rubber-stamped. Comments are stripped first, so what
 * remains is Hebrew that reaches a user: string literals and JSX text.
 *
 * The allowlist is EMPTY, and that is the point. This repo's production source
 * has no Hebrew literals today; the test exists to keep it that way rather than
 * to track debt. (The vettrack counterpart carries 17 entries — it was written
 * against a codebase that had already accumulated them.)
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER.
 * `__tests__` is excluded. Test files legitimately hold Hebrew: the i18n suites
 * assert real translations (`expect(i18n.t("common.save")).toBe("שמור")`), and
 * fixtures use realistic Hebrew names and reasons. A rule covering tests would
 * fire on the suites whose entire job is to check Hebrew, so hardcoded copy in
 * a test stays a review concern, not a CI one.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, relative } from "path";

const HEBREW_RE = /[֐-׿]/;
const SCAN_ROOT = "src";
const SCAN_EXTS = new Set([".ts", ".tsx"]);

/** Production files awaiting extraction. Empty by design — see the header. */
const KNOWN_DEBT_ALLOWLIST = new Set<string>([]);

/**
 * Strip comments so only code remains. Block comments first, then line
 * comments — and a line comment is only recognised when `//` is not preceded by
 * `:`, so a `https://` inside a string is not mistaken for one.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, root: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // Tests and the locale JSON itself are out of scope — see the header.
      if (entry === "__tests__" || entry === "locales") continue;
      walk(full, root, acc);
      continue;
    }
    const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
    if (SCAN_EXTS.has(ext)) acc.push(relative(root, full));
  }
}

function findHebrewOffenders(): string[] {
  const cwd = process.cwd();
  const files: string[] = [];
  walk(resolve(cwd, SCAN_ROOT), cwd, files);
  return files
    .filter((rel) => HEBREW_RE.test(stripComments(readFileSync(resolve(cwd, rel), "utf-8"))))
    .sort();
}

describe("no Hebrew literals in production source", () => {
  const offenders = findHebrewOffenders();

  it("no source file outside the allowlist carries Hebrew in code", () => {
    expect(offenders.filter((f) => !KNOWN_DEBT_ALLOWLIST.has(f))).toEqual([]);
  });

  it("the allowlist has no stale entries", () => {
    expect([...KNOWN_DEBT_ALLOWLIST].filter((f) => !offenders.includes(f)).sort()).toEqual([]);
  });

  it("actually reads files — a scan that finds nothing because it walked nothing is not a pass", () => {
    const cwd = process.cwd();
    const files: string[] = [];
    walk(resolve(cwd, SCAN_ROOT), cwd, files);
    expect(files.length).toBeGreaterThan(100);
  });
});
