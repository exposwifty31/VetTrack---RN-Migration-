/**
 * G4 — offline emergency-block for the RN fetch layer.
 *
 * Frozen doctrine (ported from the Capacitor client): Code Blue mutations must
 * NEVER be queued, retried, or persisted for offline replay — replaying
 * clinical actions minutes after a live emergency violates clinical
 * correctness. Offline attempts fail LOUD with `EmergencyOfflineError`.
 *
 * The block list is driven ENTIRELY by the vendored manifest
 * (`EMERGENCY_OFFLINE_BLOCK_MUTATIONS` via `@vettrack/contracts`, pinned by
 * VETTRACK_SHA) — never a hand-maintained local list.
 *
 * Offline signal: there is no pre-flight connectivity check. Matching the
 * canonical web implementation (vettrack `src/lib/request-core.ts`), the
 * classifier is consulted ONLY when the network dispatch itself rejects —
 * which structurally guarantees online requests pass through untouched.
 */
import {
  classifyEmergencyEndpointFromManifest,
  type EmergencyEndpointClass,
} from "@vettrack/contracts";

export type { EmergencyEndpointClass };

/** Name-parity wrapper for the web client's `classifyEmergencyEndpoint`. */
export function classifyEmergencyEndpoint(
  url: string,
  method: string,
): EmergencyEndpointClass | null {
  return classifyEmergencyEndpointFromManifest(url, method);
}

/**
 * Loud, dedicated failure for an emergency mutation attempted offline. The
 * error type IS the contract for future Code Blue UI slices — no toast/screen
 * work in this slice.
 */
export class EmergencyOfflineError extends Error {
  readonly endpointClass: EmergencyEndpointClass;
  readonly path: string;
  readonly method: string;

  constructor(endpointClass: EmergencyEndpointClass, path: string, method: string) {
    super(
      `EMERGENCY_OFFLINE_BLOCKED: ${method} ${path} (${endpointClass}) requires online execution`,
    );
    this.name = "EmergencyOfflineError";
    this.endpointClass = endpointClass;
    this.path = path;
    this.method = method;
  }
}

export type EmergencyBlockBufferEntry = {
  path: string;
  method: string;
  endpointClass: EmergencyEndpointClass;
  ts: number;
};

const BUFFER_MAX = 200;

// Process-lifetime module singleton, deliberately NOT the storage port: the
// buffer must be structurally incapable of surviving a restart — a durable
// record of emergency attempts would be a potential replay source, which the
// doctrine forbids. Local diagnostics only; NEVER posted to any server.
let buffer: readonly EmergencyBlockBufferEntry[] = [];

/**
 * C5 — a monotonic tally of blocked emergency mutations per class. Distinct from
 * the FIFO `buffer` above: the buffer keeps only the last BUFFER_MAX attempts, so
 * on a device that blocks many emergency writes the earliest ones are evicted and
 * the true volume is lost. This count is the fleet-visible signal that survives
 * eviction. It is a bounded object (the endpoint-class union is closed) of plain
 * integers — NOT a replay source — so it does not violate the no-persist doctrine
 * that governs `buffer`. Process-lifetime only; never posted to any server.
 */
const counts: Partial<Record<EmergencyEndpointClass, number>> = {};

/**
 * Read accessor for a future debug UI. Returns a detached snapshot (cloned
 * entries) so callers can never mutate the module-owned buffer.
 */
export function readEmergencyBlockBuffer(): readonly EmergencyBlockBufferEntry[] {
  return buffer.map((entry) => ({ ...entry }));
}

/**
 * C5 read accessor — a detached snapshot of the per-class blocked-mutation counts.
 * Callers cannot mutate the module-owned tally.
 */
export function getEmergencyBlockCounts(): Readonly<Partial<Record<EmergencyEndpointClass, number>>> {
  return { ...counts };
}

function recordEmergencyBlock(entry: EmergencyBlockBufferEntry): void {
  buffer = [...buffer, entry].slice(-BUFFER_MAX);
  counts[entry.endpointClass] = (counts[entry.endpointClass] ?? 0) + 1;
}

/**
 * Known network-level fetch rejection messages, anchored to the COMPLETE
 * message each engine emits so neither a programming error that also throws
 * TypeError (e.g. "Invalid URL") nor an app error that merely contains a
 * known phrase (e.g. "Failed to fetch request configuration") is ever masked
 * as an offline block:
 *   - "Network request failed" — RN / whatwg-fetch
 *   - "Failed to fetch"        — Chromium
 *   - "Load failed"            — WebKit / Safari
 *   - "fetch failed"           — undici (Node / jest env)
 *   - "NetworkError when attempting to fetch resource." — Firefox
 * Caller aborts are cancellations, not offline — never converted to a block.
 */
const NETWORK_FAILURE_MESSAGE =
  /^(?:network request failed|failed to fetch|load failed|fetch failed|networkerror when attempting to fetch resource\.)$/i;

export function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return false;
  return NETWORK_FAILURE_MESSAGE.test(err.message);
}

/**
 * Fetch-layer hook: given a rejected network dispatch, return the loud
 * `EmergencyOfflineError` to throw instead (recording the attempt in the
 * local diagnostic buffer), or null when the request is not an
 * offline-blocked emergency mutation — the caller then rethrows the original
 * error unchanged, keeping every existing call site byte-identical.
 */
export function emergencyOfflineErrorFromFailedDispatch(
  err: unknown,
  path: string,
  method: string,
): EmergencyOfflineError | null {
  if (!isNetworkFailure(err)) return null;
  const endpointClass = classifyEmergencyEndpoint(path, method);
  if (!endpointClass) return null;
  const upperMethod = method.toUpperCase();
  recordEmergencyBlock({ path, method: upperMethod, endpointClass, ts: Date.now() });
  return new EmergencyOfflineError(endpointClass, path, upperMethod);
}

/** Test-only — reset the process-lifetime buffer and C5 counts between cases. */
export function _clearEmergencyBlockBufferForTests(): void {
  buffer = [];
  for (const key of Object.keys(counts)) {
    delete counts[key as EmergencyEndpointClass];
  }
}
