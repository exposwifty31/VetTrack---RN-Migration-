/**
 * G4-6 — persistence for the offline write-queue.
 *
 * Storage engine note: the task brief assumed op-sqlite ("Expo (`expo-sqlite`
 * adapter)" per the shared `pending-sync.ts` contract comment). Verified
 * against this repo's actual `package.json` (2026-08-11): there is no
 * op-sqlite/expo-sqlite dependency — that comment is aspirational web-side
 * text describing a FUTURE Expo adapter, not this codebase's current state.
 * The RN app's real persistent KV store is MMKV via `StoragePort`
 * (`src/lib/safe-storage.ts`), the same engine `locale-resolver.ts` and the
 * emergency-block diagnostics use. Reusing it avoids adding a new native
 * dependency (config plugin + pod/gradle install) for a queue that fits
 * comfortably in a JSON blob — see the G4-6 report for the full discrepancy
 * note to the Lead.
 *
 * The whole queue is stored as one JSON array under a single key. Rows are
 * small (equipment-sized mutations), so whole-array read/write is cheap and
 * keeps FIFO ordering trivial (array order = insertion order). Callers in
 * offline-queue.ts always re-read fresh immediately before patching a row by
 * `clientMutationId` — never hold a snapshot across an `await` and write it
 * back wholesale — so a concurrent enqueue() during an in-flight replay
 * fetch is never clobbered.
 */
import type { PendingSync } from "@vettrack/contracts";

export const QUEUE_STORAGE_KEY = "vt.offline_queue.v1";

/**
 * Lazily required (NOT a top-level import): `@/lib/safe-storage` transitively
 * pulls in `react-native-mmkv` → `react-native-nitro-modules`, which throws
 * at IMPORT time (not call time) when no native binary is present — true
 * under jest for every test file, mocked or not. A top-level import here
 * would poison every consumer of `auth-fetch.ts` (nearly the whole app's
 * test suite) merely by importing it, whether or not a test ever exercises
 * an offline write. Deferring to call time means only tests that actually
 * invoke `readQueue`/`writeQueue` need to mock `@/lib/safe-storage` — the
 * same scoping the rest of the repo already relies on (see
 * `locale-toggle.test.ts`'s "absent under jest" comment for the precedent).
 */
function getSafeStorage(): typeof import("@/lib/safe-storage") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see doc above
  return require("@/lib/safe-storage") as typeof import("@/lib/safe-storage");
}

type SerializedPendingSync = Omit<PendingSync, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function serialize(item: PendingSync): SerializedPendingSync {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function deserialize(raw: SerializedPendingSync): PendingSync {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

const REQUIRED_STRING_FIELDS = [
  "type",
  "endpoint",
  "method",
  "body",
  "status",
  "clientMutationId",
  "idempotencyKey",
  "createdAt",
  "updatedAt",
] as const;

function isValidDateString(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

/**
 * Structural + semantic validation for one persisted row (CodeRabbit PR #51:
 * a structurally-valid JSON *value* can still be an invalid queue *entry* —
 * e.g. a missing/garbage `createdAt` produces an Invalid Date, which then
 * throws from `toISOString()` on the NEXT `writeQueue()` call, poisoning
 * every future enqueue/replay, not just the malformed row). Invalid rows are
 * discarded individually — a corrupt sibling never takes down the rest of
 * the (possibly multi-user) queue.
 */
function isValidSerializedPendingSync(raw: unknown): raw is SerializedPendingSync {
  if (typeof raw !== "object" || raw === null) return false;
  const row = raw as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof row[field] !== "string") return false;
  }
  if (!isValidDateString(row.createdAt) || !isValidDateString(row.updatedAt)) return false;
  if (typeof row.clientTimestamp !== "number" || Number.isNaN(row.clientTimestamp)) return false;
  if (typeof row.retries !== "number" || Number.isNaN(row.retries)) return false;
  if (typeof row.schemaVersion !== "number" || Number.isNaN(row.schemaVersion)) return false;
  return true;
}

/**
 * Diagnostic record of the last time `readQueue` discarded something —
 * either individual invalid rows within otherwise-valid JSON, or the whole
 * blob when it wasn't parsable JSON at all. Each discarded row is a
 * potentially lost mutation; CodeRabbit PR #51 (trivial finding) flagged
 * that dropping it via `.filter()` with no signal makes persistence
 * corruption invisible to both the operator and any future debugging.
 * Mirrors `OfflineQueueBridge.tsx`'s `reportReplayRejection` precedent — no
 * Sentry/telemetry backend exists in this repo, so this is a local
 * diagnostic buffer, not a fabricated telemetry call.
 */
export type DiscardedRowsReport = {
  count: number;
  reason: "invalid_entries" | "unparsable_queue" | "top_level_invalid";
  ts: number;
};
let lastDiscardedRowsReport: DiscardedRowsReport | null = null;

export function getLastDiscardedOfflineQueueRowsReport(): DiscardedRowsReport | null {
  return lastDiscardedRowsReport;
}

/** Test-only — reset the module-lifetime diagnostic between cases. */
export function _clearLastDiscardedOfflineQueueRowsReportForTests(): void {
  lastDiscardedRowsReport = null;
}

function reportDiscardedRows(count: number, reason: DiscardedRowsReport["reason"]): void {
  if (count <= 0) return;
  lastDiscardedRowsReport = { count, reason, ts: Date.now() };
}

/**
 * Reads the persisted queue. Corrupt/missing top-level data fails safe to an
 * empty queue; individual malformed rows within otherwise-valid JSON are
 * dropped (not the whole queue) — see `isValidSerializedPendingSync`. Either
 * case reports via `getLastDiscardedOfflineQueueRowsReport`.
 */
export function readQueue(): PendingSync[] {
  const raw = getSafeStorage().safeStorageGetItem(QUEUE_STORAGE_KEY, "local");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      // Valid JSON (e.g. "{}" or "null") but not the array shape the queue
      // requires — the WHOLE persisted queue is unusable, not just some
      // rows. CodeRabbit PR #51 round 3 nit: this used to fail safe to []
      // with no report at all, making a fully-corrupt-but-parsable queue
      // invisible to diagnostics.
      reportDiscardedRows(1, "top_level_invalid");
      return [];
    }
    const valid = parsed.filter(isValidSerializedPendingSync);
    reportDiscardedRows(parsed.length - valid.length, "invalid_entries");
    return valid.map(deserialize);
  } catch {
    reportDiscardedRows(1, "unparsable_queue");
    return [];
  }
}

/** Persists the full queue (whole-array replace — see module doc for why this is safe). */
export function writeQueue(items: readonly PendingSync[]): void {
  getSafeStorage().safeStorageSetItem(QUEUE_STORAGE_KEY, JSON.stringify(items.map(serialize)), "local");
}
