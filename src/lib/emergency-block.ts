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
 * Read accessor for a future debug UI. Returns a detached snapshot (cloned
 * entries) so callers can never mutate the module-owned buffer.
 */
export function readEmergencyBlockBuffer(): readonly EmergencyBlockBufferEntry[] {
  return buffer.map((entry) => ({ ...entry }));
}

function recordEmergencyBlock(entry: EmergencyBlockBufferEntry): void {
  buffer = [...buffer, entry].slice(-BUFFER_MAX);
}

/**
 * Known network-level fetch rejection messages, matched narrowly so a
 * programming error that also throws TypeError (e.g. "Invalid URL") is never
 * masked as an offline block:
 *   - "Network request failed" — RN / whatwg-fetch
 *   - "Failed to fetch"        — Chromium
 *   - "Load failed"            — WebKit / Safari
 *   - "fetch failed"           — undici (Node / jest env)
 *   - "NetworkError"           — Firefox
 * Caller aborts are cancellations, not offline — never converted to a block.
 */
const NETWORK_FAILURE_MESSAGE =
  /network request failed|failed to fetch|load failed|fetch failed|networkerror/i;

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

/** Test-only — reset the process-lifetime buffer between cases. */
export function _clearEmergencyBlockBufferForTests(): void {
  buffer = [];
}
