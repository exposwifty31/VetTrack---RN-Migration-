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

/** Reads the persisted queue. Corrupt/missing data fails safe to an empty queue. */
export function readQueue(): PendingSync[] {
  const raw = getSafeStorage().safeStorageGetItem(QUEUE_STORAGE_KEY, "local");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SerializedPendingSync[]).map(deserialize);
  } catch {
    return [];
  }
}

/** Persists the full queue (whole-array replace — see module doc for why this is safe). */
export function writeQueue(items: readonly PendingSync[]): void {
  getSafeStorage().safeStorageSetItem(QUEUE_STORAGE_KEY, JSON.stringify(items.map(serialize)), "local");
}
