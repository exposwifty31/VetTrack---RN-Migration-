/**
 * App-version comparison and a fail-quiet "latest version" feed reader.
 *
 * STATUS: the comparison half is complete and tested. It is deliberately NOT
 * wired to a screen, because no feed currently publishes this app's version:
 *
 *   - `https://vettrack.uk/api/version` reports the vettrack WEB/SERVER deploy's
 *     version. Its `version` field is read from the vettrack monorepo's own
 *     package.json (vettrack `server/index.ts:54`, mounted at `:239`), which is
 *     `1.2.0` today — OLDER than this app's `1.3.0` (`app.json:5`). Nothing in
 *     that payload (`buildTag`, `gitCommit`, `builtAt`) describes a React Native
 *     release either.
 *   - Publishing a real feed means adding a field server-side in the separate
 *     `vettrack` repository.
 *
 * So `fetchLatestAppVersion` takes the feed path as a REQUIRED argument and this
 * module exports no default URL. Do not point it at `/api/version`: that feed is
 * behind, so it yields silence today and an inverted "update available" nag the
 * moment the web deploy bumps past this app's version.
 */
import Constants from "expo-constants";

import { resolveApiUrl } from "./api-origin";

const DEFAULT_TIMEOUT_MS = 8000;

/** Dotted, non-negative, decimal integers only — e.g. "1", "1.2", "1.2.10". */
const NUMERIC_SEGMENT = /^\d+$/;

/**
 * Parse a dotted numeric version into segments, or `null` if it is not one.
 *
 * The strict per-segment guard exists because `Number()` silently accepts a
 * surprising amount: `Number("0x1E") === 30`, `Number("1e3") === 1000`,
 * `Number(" 1 ") === 1`, `Number("+1") === 1`, `Number("") === 0`. Any of those
 * turns a malformed version into a confident, wrong ordering.
 */
function parseVersion(value: string): number[] | null {
  if (typeof value !== "string") return null;
  const segments = value.split(".");
  const parsed: number[] = [];
  for (const segment of segments) {
    if (!NUMERIC_SEGMENT.test(segment)) return null;
    const numeric = Number(segment);
    if (!Number.isSafeInteger(numeric)) return null;
    parsed.push(numeric);
  }
  return parsed.length > 0 ? parsed : null;
}

/**
 * Compare two dotted numeric versions.
 *
 * Returns a negative number when `a` precedes `b`, positive when it follows, and
 * `0` when equal. Returns `null` — never `NaN` — when either side is not a plain
 * dotted numeric version, so a caller cannot mistake "unknown" for "not newer".
 *
 * Missing trailing segments are zero-padded: "1.2" equals "1.2.0".
 * Semver prerelease/build suffixes ("1.3.0-beta.1", "1.3.0+build.5") are out of
 * scope and rejected rather than guessed at.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The version the RUNNING JS bundle was configured with (`app.json`'s
 * `expo.version`), or `null` when unavailable.
 *
 * CAVEAT for whoever adds `expo-updates`: `Constants.expoConfig` is then served
 * from the downloaded update manifest rather than the embedded binary manifest,
 * so this stops meaning "the installed binary's version". The binary version is
 * `expo-application`'s `nativeApplicationVersion` — not a dependency today.
 * (`src/screens/SettingsScreen.tsx` reads `expoConfig.version` and inherits the
 * same caveat.)
 */
export function getRunningAppVersion(): string | null {
  const version = Constants.expoConfig?.version;
  if (typeof version !== "string") return null;
  const trimmed = version.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface FetchLatestAppVersionOptions {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Read `{ version: string }` from a version feed. Returns `null` on absolutely
 * anything unexpected and never throws or rejects — an out-of-date notice is the
 * lowest-stakes thing in this app and must never be what breaks it.
 *
 * Deliberately uses a plain unauthenticated `fetch`, not `authFetch`: the check
 * has to work while signed out, and `authFetch` throws `AUTH_INVALID` before
 * dispatch when there is no token.
 *
 * `feedPath` is required — see the module header for why there is no default.
 */
export async function fetchLatestAppVersion(
  feedPath: string,
  options: FetchLatestAppVersionOptions = {},
): Promise<string | null> {
  const { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Inside the try on purpose: resolveApiUrl throws when
    // EXPO_PUBLIC_API_ORIGIN is unset (api-origin.ts:19-22).
    const url = resolveApiUrl(feedPath);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // The feed is public and versions are not per-user: never let an ambient
      // cookie or client cert ride along on what must stay an anonymous probe.
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const version = (body as { version?: unknown }).version;
    if (typeof version !== "string") return null;
    const trimmed = version.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface UpdateNotice {
  running: string;
  latest: string;
}

/**
 * Resolve whether to show a non-blocking "update available" notice.
 *
 * Returns `null` — show nothing — unless the running build is STRICTLY behind a
 * version that parsed cleanly. Equal, ahead, missing and unparseable all mean
 * silence. "Ahead" is not hypothetical: see the module header.
 */
export function resolveUpdateNotice(
  running: string | null,
  latest: string | null,
): UpdateNotice | null {
  if (running === null || latest === null) return null;
  const ordering = compareVersions(running, latest);
  if (ordering === null || ordering >= 0) return null;
  return { running, latest };
}
