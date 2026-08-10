/**
 * G4-6 — persistence round-trip for the offline write-queue.
 *
 * `@/lib/safe-storage` wraps the real MMKV port, which is unavailable under
 * jest (see locale-toggle.test.ts) — mocked here with an in-memory Map, the
 * same pattern used across the repo.
 */
import type { PendingSync } from "@vettrack/contracts";

import {
  _clearLastDiscardedOfflineQueueRowsReportForTests,
  getLastDiscardedOfflineQueueRowsReport,
  QUEUE_STORAGE_KEY,
  readQueue,
  writeQueue,
} from "../offline-queue-store";

const mockMemoryStore = new Map<string, string>();

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((key: string) => mockMemoryStore.get(key) ?? null),
  safeStorageSetItem: jest.fn((key: string, value: string) => {
    mockMemoryStore.set(key, value);
    return true;
  }),
  safeStorageRemoveItem: jest.fn((key: string) => mockMemoryStore.delete(key)),
}));

function makeItem(overrides: Partial<PendingSync> = {}): PendingSync {
  const now = new Date("2026-08-11T00:00:00.000Z");
  return {
    type: "checkout",
    endpoint: "/api/equipment/eq-1/checkout",
    method: "POST",
    body: "{}",
    createdAt: now,
    retries: 0,
    status: "pending",
    clientTimestamp: now.getTime(),
    clientMutationId: "cmid-1",
    idempotencyKey: "idem-1",
    schemaVersion: 2,
    updatedAt: now,
    structuredError: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockMemoryStore.clear();
  _clearLastDiscardedOfflineQueueRowsReportForTests();
});

describe("offline-queue-store", () => {
  it("returns an empty queue when nothing is persisted", () => {
    expect(readQueue()).toEqual([]);
  });

  it("round-trips items, preserving Date fields across JSON serialization", () => {
    const item = makeItem();
    writeQueue([item]);

    const reread = readQueue();

    expect(reread).toHaveLength(1);
    expect(reread[0].createdAt).toBeInstanceOf(Date);
    expect(reread[0].updatedAt).toBeInstanceOf(Date);
    expect(reread[0].createdAt.toISOString()).toBe(item.createdAt.toISOString());
    expect(reread[0]).toMatchObject({
      clientMutationId: "cmid-1",
      endpoint: "/api/equipment/eq-1/checkout",
      method: "POST",
    });
  });

  it("preserves insertion order (FIFO) across a write/read cycle", () => {
    const a = makeItem({ clientMutationId: "a", clientTimestamp: 1 });
    const b = makeItem({ clientMutationId: "b", clientTimestamp: 2 });
    const c = makeItem({ clientMutationId: "c", clientTimestamp: 3 });
    writeQueue([a, b, c]);

    expect(readQueue().map((i) => i.clientMutationId)).toEqual(["a", "b", "c"]);
  });

  it("persists under a single, stable storage key (durability across a simulated app restart)", () => {
    writeQueue([makeItem()]);
    // A restart re-imports modules but the underlying MMKV file is untouched —
    // simulated here by reading directly via the same key a fresh call would use.
    expect(mockMemoryStore.has(QUEUE_STORAGE_KEY)).toBe(true);
    expect(readQueue()).toHaveLength(1);
  });

  it("fails safe (empty queue) on corrupt persisted JSON rather than throwing", () => {
    mockMemoryStore.set(QUEUE_STORAGE_KEY, "{not valid json");
    expect(readQueue()).toEqual([]);
  });

  it("discards a structurally-valid-JSON entry with an invalid createdAt, keeping its siblings (CodeRabbit PR #51)", () => {
    const good = makeItem({ clientMutationId: "good" });
    const badCreatedAt = { ...makeItem({ clientMutationId: "bad-date" }), createdAt: "not-a-date" };
    mockMemoryStore.set(
      QUEUE_STORAGE_KEY,
      JSON.stringify([
        { ...good, createdAt: good.createdAt.toISOString(), updatedAt: good.updatedAt.toISOString() },
        badCreatedAt,
      ]),
    );

    const reread = readQueue();

    expect(reread.map((i) => i.clientMutationId)).toEqual(["good"]);
  });

  it("discards an entry missing required fields (e.g. no endpoint/method) rather than poisoning the queue", () => {
    const good = makeItem({ clientMutationId: "good" });
    mockMemoryStore.set(
      QUEUE_STORAGE_KEY,
      JSON.stringify([
        { ...good, createdAt: good.createdAt.toISOString(), updatedAt: good.updatedAt.toISOString() },
        { clientMutationId: "malformed", status: "pending" }, // missing endpoint, method, body, etc.
      ]),
    );

    expect(readQueue().map((i) => i.clientMutationId)).toEqual(["good"]);
  });

  it("a queue read back after discarding an invalid entry can be safely re-serialized (no toISOString() throw)", () => {
    mockMemoryStore.set(
      QUEUE_STORAGE_KEY,
      JSON.stringify([{ ...makeItem(), createdAt: "garbage", updatedAt: "garbage" }]),
    );

    const reread = readQueue();
    expect(() => writeQueue([...reread, makeItem({ clientMutationId: "new" })])).not.toThrow();
    expect(readQueue().map((i) => i.clientMutationId)).toEqual(["new"]);
  });

  it("reports discarded invalid rows instead of dropping them silently (CodeRabbit PR #51 trivial finding)", () => {
    const good = makeItem({ clientMutationId: "good" });
    mockMemoryStore.set(
      QUEUE_STORAGE_KEY,
      JSON.stringify([
        { ...good, createdAt: good.createdAt.toISOString(), updatedAt: good.updatedAt.toISOString() },
        { clientMutationId: "malformed-1", status: "pending" },
        { ...good, clientMutationId: "malformed-2", createdAt: "not-a-date" },
      ]),
    );

    expect(getLastDiscardedOfflineQueueRowsReport()).toBeNull(); // nothing reported before reading

    readQueue();

    const report = getLastDiscardedOfflineQueueRowsReport();
    expect(report).not.toBeNull();
    expect(report?.count).toBe(2);
    expect(report?.reason).toBe("invalid_entries");
  });

  it("does not report anything when every persisted row is valid", () => {
    writeQueue([makeItem()]);
    _clearLastDiscardedOfflineQueueRowsReportForTests();

    readQueue();

    expect(getLastDiscardedOfflineQueueRowsReport()).toBeNull();
  });

  it("reports an unparsable queue distinctly, so a fully-corrupt blob isn't invisible either", () => {
    mockMemoryStore.set(QUEUE_STORAGE_KEY, "{not valid json");

    readQueue();

    const report = getLastDiscardedOfflineQueueRowsReport();
    expect(report).not.toBeNull();
    expect(report?.reason).toBe("unparsable_queue");
  });

  it("reports valid-but-non-array top-level JSON (e.g. '{}') distinctly (CodeRabbit PR #51 round 3 nit)", () => {
    mockMemoryStore.set(QUEUE_STORAGE_KEY, "{}");

    const result = readQueue();

    expect(result).toEqual([]);
    const report = getLastDiscardedOfflineQueueRowsReport();
    expect(report).not.toBeNull();
    expect(report?.reason).toBe("top_level_invalid");
  });

  it("reports a persisted 'null' the same way — a fully-unusable queue is never invisible to diagnostics", () => {
    mockMemoryStore.set(QUEUE_STORAGE_KEY, "null");

    readQueue();

    const report = getLastDiscardedOfflineQueueRowsReport();
    expect(report).not.toBeNull();
    expect(report?.reason).toBe("top_level_invalid");
  });
});
