/// <reference types="node" />
/**
 * ENDPOINT-DRIFT CONTRACT TEST
 *
 * Extracts every `/api/*` literal from RN's API modules (`src/lib/api.ts`,
 * `src/lib/api-origin.ts`, `src/lib/api/*.ts`) and asserts each one resolves to a
 * real server route.
 *
 * ── How much server truth is actually reachable from THIS repo ───────────────
 * The server lives in a different repository (vettrack). This repo vendors a
 * pinned snapshot, and the vendored path set is SPARSE. Verified, not assumed:
 *
 *   - `scripts/vendor-vettrack.mjs:18` → SPARSE_PATHS = ["packages/contracts", "shared"].
 *     `server/` is NOT vendored; `.vendor/vettrack/` has no server directory.
 *   - `.gitignore:55` → `.vendor/` is gitignored (`git ls-files .vendor` = 0 files),
 *     so the snapshot is regenerated from the network at preinstall.
 *   - The pin (`VETTRACK_SHA = 8d379fac…`) was bumped 2026-08-18 from dc10c799 (131
 *     commits behind) to vettrack `main` @ that date. Note what that bump did NOT
 *     change: `packages/contracts/src/emergency.ts` is byte-identical at both shas
 *     (`git diff dc10c799..8d379fac -- packages/contracts/src/emergency.ts` is empty),
 *     so TIER 1's allowlist — and this suite's result — was the same before and after.
 *     A stale pin is only visible here when `emergency.ts` itself moves.
 *
 * So the FULL route table is not reachable — but a real, server-owned SUBSET is:
 * `EMERGENCY_SERVER_ROUTE_ALLOWLIST` from `@vettrack/contracts` (vendored, and it
 * resolves under jest — see `contracts-bridge.test.ts`). That yields two tiers:
 *
 *   TIER 1 (armed, below): every RN path under an allowlist-derived prefix
 *           (`/api/code-blue`, `/api/realtime`, `/api/display`) is checked against
 *           real server truth. Path-only — see the comment on that suite.
 *   TIER 2 (blocked, below): the remaining ~17 domains (`/api/equipment`,
 *           `/api/appointments`, `/api/containers`, `/api/restock`, `/api/tasks`,
 *           `/api/shift-*`, `/api/users`, …) have NO reachable server route list.
 *           That suite is SKIPPED against a manifest that does not exist yet
 *           rather than faked green. See SERVER_ROUTE_MANIFEST_PATH below.
 */
import fs from "fs";
import path from "path";

import { EMERGENCY_SERVER_ROUTE_ALLOWLIST } from "@vettrack/contracts";

const LIB_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(LIB_DIR, "..", "..");
const VENDOR_SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "vendor-vettrack.mjs");

/**
 * TIER-2 BLOCKER — this file does not exist yet, so the full-surface suite below
 * is skipped. To arm it, generate on the VETTRACK side and land here:
 *
 *   WHAT: a JSON manifest of every mounted Express route, shape
 *         `{ "vettrackSha": "<40-char lowercase sha>", "routes": ["GET /api/equipment", "POST /api/equipment/:id/checkout", …] }`
 *         — one `"METHOD /path"` entry per route, `:param` for dynamic segments.
 *         `vettrackSha` is the vettrack commit the manifest was generated FROM and
 *         must equal the pin below exactly (see `pinnedVettrackSha`); a short sha
 *         is rejected on purpose, so the format stays canonical.
 *   HOW:  a generator in vettrack that walks `server/app/routes.ts` (the ~56
 *         `app.use(...)` mount prefixes) joined with each `server/routes/*.ts`
 *         router's own method+path declarations.
 *   WHERE it must end up in THIS repo: the path below, checked in.
 *         Lower-friction alternative: emit it into `packages/contracts/src/`
 *         (already inside SPARSE_PATHS) and export it, so a `VETTRACK_SHA` bump
 *         in `scripts/vendor-vettrack.mjs` delivers it with no new RN file.
 *   ALSO: the pin must equal the revision the manifest was generated from. As of the
 *         2026-08-18 bump the pin IS vettrack `main`, so a manifest generated now
 *         matches without a further bump — that window closes as `main` moves on.
 */
const SERVER_ROUTE_MANIFEST_PATH = path.join(LIB_DIR, "__generated__", "server-routes.manifest.json");

type ServerRouteManifest = { vettrackSha: string; routes: string[] };

/**
 * The vettrack revision this repo is pinned to, read from the ONE checked-in
 * declaration of it: `VETTRACK_SHA` in `scripts/vendor-vettrack.mjs`.
 *
 * Deliberately NOT read from `.vendor/vettrack/.vettrack-pin`: `.vendor/` is
 * gitignored, so it does not exist in a clean checkout and cannot be read before
 * `preinstall` has run — whereas this suite must be able to name the pin from
 * source alone. (Under npm 11 the installed package is in fact a symlink into
 * `.vendor/`; verified on disk 2026-08-18. Under pnpm it is a copy. Neither is
 * load-bearing here — the point is that the script constant is the
 * declaration a manifest generator would be pointed at, and it is always
 * readable from a clean checkout.)
 *
 * Throws rather than returning a placeholder: a sentinel like `""`/`"unknown"`
 * would compare equal to a matching sentinel in a manifest and wave it through.
 */
function pinnedVettrackSha(): string {
  if (!fs.existsSync(VENDOR_SCRIPT_PATH)) {
    throw new Error(
      `Cannot determine the pinned vettrack revision: ${VENDOR_SCRIPT_PATH} is missing. ` +
        `This test compares the server-route manifest against that pin; without it, the ` +
        `full-surface suite would validate routes from an unknown server revision.`,
    );
  }
  const source = fs.readFileSync(VENDOR_SCRIPT_PATH, "utf8");
  const match = /VETTRACK_SHA\s*=\s*["'`]([0-9a-fA-F]{40})["'`]/.exec(source);
  if (!match) {
    throw new Error(
      `Cannot parse VETTRACK_SHA (a 40-char sha) out of ${VENDOR_SCRIPT_PATH}. ` +
        `If the pin was renamed or reformatted, update pinnedVettrackSha() in this file — ` +
        `do not delete the check: it is what stops a stale manifest from asserting coverage it does not have.`,
    );
  }
  return match[1].toLowerCase();
}

/**
 * Reads the manifest AND enforces that it was generated from the pinned revision.
 * The enforcement lives here, not in a sibling `it`, so no caller can build
 * `serverPaths` out of a manifest from the wrong server revision.
 */
function readServerRouteManifest(): ServerRouteManifest {
  const pinned = pinnedVettrackSha();
  const raw: unknown = JSON.parse(fs.readFileSync(SERVER_ROUTE_MANIFEST_PATH, "utf8"));
  const manifest = raw as Partial<ServerRouteManifest>;

  const declared = typeof manifest?.vettrackSha === "string" ? manifest.vettrackSha.trim().toLowerCase() : "";
  if (!declared) {
    throw new Error(
      `${SERVER_ROUTE_MANIFEST_PATH} has no "vettrackSha". Without it there is no way to tell ` +
        `which server revision these routes came from, so the manifest cannot be trusted. ` +
        `Regenerate it from vettrack @ ${pinned} with the documented shape.`,
    );
  }
  if (!Array.isArray(manifest.routes) || manifest.routes.some((entry) => typeof entry !== "string")) {
    throw new Error(
      `${SERVER_ROUTE_MANIFEST_PATH} has no usable "routes" array (expected string entries like "GET /api/equipment"). ` +
        `Regenerate it from vettrack @ ${pinned} with the documented shape.`,
    );
  }

  if (declared !== pinned) {
    throw new Error(
      [
        `server-routes.manifest.json was generated from a DIFFERENT vettrack revision than this repo is pinned to.`,
        `  manifest "vettrackSha" : ${declared}   (${SERVER_ROUTE_MANIFEST_PATH})`,
        `  pinned  VETTRACK_SHA   : ${pinned}   (${VENDOR_SCRIPT_PATH})`,
        `Validating RN paths against the wrong server revision asserts coverage this suite does not have,`,
        `which is worse than leaving the suite skipped. Fix whichever side is stale — the guard cannot tell which:`,
        `  • manifest older than the pin → regenerate it in vettrack at ${pinned} and replace the file above.`,
        `  • manifest newer than the pin → set VETTRACK_SHA = "${declared}" in scripts/vendor-vettrack.mjs,`,
        `    then run: pnpm vendor:vettrack && pnpm install`,
      ].join("\n"),
    );
  }

  return { vettrackSha: declared, routes: manifest.routes };
}

/** `${...}` inside a template literal, reduced to a single opaque marker. */
const INTERP = "\u0000";

function apiSourceFiles(): string[] {
  const files = [path.join(LIB_DIR, "api.ts"), path.join(LIB_DIR, "api-origin.ts")];
  const nested = path.join(LIB_DIR, "api");
  for (const entry of fs.readdirSync(nested).sort()) {
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".test.ts")) {
      files.push(path.join(nested, entry));
    }
  }
  return files;
}

/**
 * Single-pass scanner over TS source. Skips line/block comments (RN's API modules
 * document server routes in prose and backticked globs — `/api/tasks/*` — which a
 * raw regex would happily mistake for call sites), and returns each string/template
 * literal's value with every `${…}` replaced by INTERP rather than terminating there.
 */
function scanStringLiterals(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let buf = "";
      while (i < n && source[i] !== quote && source[i] !== "\n") {
        if (source[i] === "\\") {
          buf += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        buf += source[i];
        i += 1;
      }
      i += 1;
      out.push(buf);
      continue;
    }

    if (ch === "`") {
      i += 1;
      let buf = "";
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") {
          buf += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const c = source[i];
            if (c === "{") depth += 1;
            else if (c === "}") depth -= 1;
            else if (c === '"' || c === "'" || c === "`") {
              const q = c;
              i += 1;
              while (i < n && source[i] !== q) {
                if (source[i] === "\\") i += 1;
                i += 1;
              }
            }
            i += 1;
          }
          buf += INTERP;
          continue;
        }
        buf += source[i];
        i += 1;
      }
      i += 1;
      out.push(buf);
      continue;
    }

    i += 1;
  }

  return out;
}

/**
 * Literal → canonical route path, or null when the literal is not an API path.
 * `${id}` occupying a whole segment becomes `:param`; an interpolation glued to
 * the end of a segment is a query/suffix builder (`` `/api/equipment${query}` ``),
 * so the route ends there.
 */
function normalizePath(literal: string): string | null {
  if (literal !== "/api" && !literal.startsWith("/api/")) return null;

  const withoutQuery = literal.split("?")[0].split("#")[0];
  const segments: string[] = [];

  for (const segment of withoutQuery.split("/")) {
    if (segment === "") continue;
    if (segment === INTERP) {
      segments.push(":param");
      continue;
    }
    const at = segment.indexOf(INTERP);
    if (at >= 0) {
      if (at > 0) segments.push(segment.slice(0, at));
      break;
    }
    segments.push(segment);
  }

  return `/${segments.join("/")}`;
}

function collectRnPaths(): Set<string> {
  const out = new Set<string>();
  for (const file of apiSourceFiles()) {
    for (const literal of scanStringLiterals(fs.readFileSync(file, "utf8"))) {
      const normalized = normalizePath(literal);
      if (normalized) out.add(normalized);
    }
  }
  return out;
}

/** Allowlist entries are `"METHOD /path"`; `:id`-style params → `:param`. */
function allowlistPaths(): Set<string> {
  const out = new Set<string>();
  for (const entry of EMERGENCY_SERVER_ROUTE_ALLOWLIST) {
    const routePath = entry.slice(entry.indexOf("/")).replace(/\/:[A-Za-z0-9_]+/g, "/:param");
    const trimmed = routePath.length > 1 ? routePath.replace(/\/+$/, "") : routePath;
    out.add(trimmed);
  }
  return out;
}

/** `/api/code-blue`, `/api/realtime`, `/api/display` — DERIVED from the allowlist, never
 *  hardcoded, so a new emergency domain added in vettrack widens coverage on a pin bump. */
function allowlistPrefixes(): string[] {
  const out = new Set<string>();
  for (const routePath of allowlistPaths()) {
    const segments = routePath.split("/").filter(Boolean);
    if (segments.length >= 2) out.add(`/${segments[0]}/${segments[1]}`);
  }
  return [...out];
}

const WELL_FORMED = /^\/api(\/(?::param|[a-z0-9][a-z0-9._-]*))+$/;

describe("endpoint-drift: extraction", () => {
  const rnPaths = collectRnPaths();

  it("resolves interpolated path segments instead of truncating at the interpolation", () => {
    expect([...rnPaths].sort()).toEqual(
      expect.arrayContaining([
        "/api/code-blue/sessions/:param/logs",
        "/api/code-blue/sessions/:param/end",
        "/api/code-blue/sessions/:param/presence",
      ]),
    );
  });

  it("emits only well-formed route paths (no comment prose, globs or interpolation debris)", () => {
    const malformed = [...rnPaths].filter((p) => !WELL_FORMED.test(p)).sort();
    expect(malformed).toEqual([]);
  });

  it("is not vacuous — covers the real breadth of the RN API surface", () => {
    expect(rnPaths.size).toBeGreaterThanOrEqual(40);
  });
});

/**
 * Runs TODAY, with no manifest present. The manifest guard below is only as good as
 * its ability to name the pinned revision, and that resolution is a regex over a
 * separate `.mjs` file — the kind of thing that rots silently when someone reformats
 * or renames the constant. Exercising it here means the rot surfaces as a failure now,
 * instead of as a guard that quietly throws (or worse, matches nothing) the day a
 * manifest finally lands.
 */
describe("endpoint-drift: pinned vettrack revision", () => {
  it("resolves the pinned server revision from scripts/vendor-vettrack.mjs", () => {
    expect(pinnedVettrackSha()).toMatch(/^[0-9a-f]{40}$/);
  });
});

/**
 * TIER 1 — armed. Real server truth, vendored via `@vettrack/contracts`.
 *
 * Compared PATH-ONLY, deliberately: allowlist entries carry a method
 * (`POST /api/code-blue/sessions` is listed, `GET` is not) but the RN call sites
 * express the method in a `RequestInit` this extractor does not read. So this
 * catches a RENAMED or REMOVED path — the drift that actually breaks the client —
 * and does NOT claim to catch a wrong method. Don't inflate that claim.
 */
describe("endpoint-drift: emergency surface (real server truth via @vettrack/contracts)", () => {
  const rnPaths = collectRnPaths();
  const allowed = allowlistPaths();
  const prefixes = allowlistPrefixes();
  const inScope = [...rnPaths]
    .filter((p) => prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`)))
    .sort();

  it("covers the emergency surface non-vacuously", () => {
    // Guard against the failure mode where a broken extractor empties the scope
    // and makes the assertion below pass by checking nothing.
    //
    // FLOOR, not a pin: this asserts the scope is populated, not that it has a
    // particular size, so adding emergency call sites must never redden it.
    //
    // Was 7 until 2026-08-15. #62 deleted `realtime.outboxHead` and
    // `realtime.replay` from src/lib/api.ts — both had zero call sites, and gap
    // recovery runs over SSE `Last-Event-ID` instead — which removed the only
    // two /api/realtime/* literals in production code and dropped the scope to
    // 5. The guard fired on that merge exactly as designed: #62 and #63 were
    // each green alone and red together, because one deleted the paths the
    // other counted. If this number drops again, check whether the shrink was
    // deliberate before lowering it.
    expect(inScope.length).toBeGreaterThanOrEqual(5);
  });

  it("every RN emergency-surface path resolves to a real server route", () => {
    const unknown = inScope.filter((p) => !allowed.has(p));
    expect(unknown).toEqual([]);
  });
});

/**
 * TIER 2 — BLOCKED. No server route list is reachable for the non-emergency
 * domains, so this stays skipped rather than passing on invented data. It arms
 * itself the moment SERVER_ROUTE_MANIFEST_PATH lands (see the constant above for
 * exactly what must be generated, by whom, and where).
 *
 * Presence is NOT sufficient to arm it honestly. A manifest describes vettrack @ the
 * revision it was generated from, which drifts from this repo's pin as `main` moves,
 * so `readServerRouteManifest()` refuses any manifest whose `vettrackSha` does not
 * match the pin — a green assertion over routes from the wrong server revision would
 * claim coverage this suite does not have.
 */
const manifestPresent = fs.existsSync(SERVER_ROUTE_MANIFEST_PATH);
const describeFullSurface = manifestPresent ? describe : describe.skip;

/** Reporter line must track reality: "BLOCKED … not generated" printed above green
 *  checkmarks would itself be a lie about what this suite covers. */
const fullSurfaceTitle = manifestPresent
  ? "endpoint-drift: full API surface (armed — server-routes.manifest.json, pinned revision enforced)"
  : "endpoint-drift: full API surface [BLOCKED: src/lib/__generated__/server-routes.manifest.json not generated — see SERVER_ROUTE_MANIFEST_PATH]";

describeFullSurface(fullSurfaceTitle, () => {
    it("was generated from the pinned vettrack revision", () => {
      // Throws with both shas and the two possible remedies when they diverge;
      // the assertion states the invariant for the reader.
      expect(readServerRouteManifest().vettrackSha).toBe(pinnedVettrackSha());
    });

    it("every RN /api path resolves to a real server route", () => {
      // Revision check happens inside the loader, BEFORE serverPaths is built.
      const manifest = readServerRouteManifest();
      const serverPaths = new Set(
        manifest.routes.map((entry) => {
          const routePath = entry.slice(entry.indexOf("/")).replace(/\/:[A-Za-z0-9_]+/g, "/:param");
          return routePath.length > 1 ? routePath.replace(/\/+$/, "") : routePath;
        }),
      );
      const unknown = [...collectRnPaths()].filter((p) => !serverPaths.has(p)).sort();
      expect(unknown).toEqual([]);
    });
  },
);
