/**
 * G4-6 — persistence round-trip for the offline write-queue.
 *
 * `@/lib/safe-storage` wraps the real MMKV port, which is unavailable under
 * jest (see locale-toggle.test.ts) — mocked here with an in-memory Map, the
 * same pattern used across the repo.
 */
import type { PendingSync } from "@vettrack/contracts";

import { QUEUE_STORAGE_KEY, readQueue, writeQueue } from "../offline-queue-store";

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
});
