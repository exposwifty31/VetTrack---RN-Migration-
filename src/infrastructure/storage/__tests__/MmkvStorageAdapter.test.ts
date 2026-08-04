import {
  MmkvStorageAdapter,
  StorageUnavailableError,
  type KvStore,
} from "../MmkvStorageAdapter";

function createMemoryStore(): KvStore {
  const map = new Map<string, string>();
  return {
    getString(key) {
      return map.get(key);
    },
    set(key, value) {
      map.set(key, value);
    },
    remove(key) {
      return map.delete(key);
    },
  };
}

function createThrowingStore(message: string): KvStore {
  return {
    getString() {
      throw new Error(message);
    },
    set() {
      throw new Error(message);
    },
    remove() {
      throw new Error(message);
    },
  };
}

describe("MmkvStorageAdapter", () => {
  it("round-trips get/set/remove for local and session kinds", () => {
    const adapter = new MmkvStorageAdapter({
      local: createMemoryStore(),
      session: createMemoryStore(),
    });

    adapter.setItem("locale", "he", "local");
    expect(adapter.getItem("locale", "local")).toBe("he");

    adapter.setItem("cursor", "42", "session");
    expect(adapter.getItem("cursor", "session")).toBe("42");
    expect(adapter.getItem("cursor", "local")).toBeNull();

    adapter.removeItem("locale", "local");
    expect(adapter.getItem("locale", "local")).toBeNull();

    adapter.removeItem("cursor", "session");
    expect(adapter.getItem("cursor", "session")).toBeNull();
  });

  it("throws StorageUnavailableError when the underlying store throws on read", () => {
    const adapter = new MmkvStorageAdapter({
      local: createThrowingStore("corrupt crc"),
      session: createMemoryStore(),
    });

    expect(() => adapter.getItem("any", "local")).toThrow(StorageUnavailableError);
    expect(() => adapter.getItem("any", "local")).toThrow(/corrupt crc/);
  });

  it("throws StorageUnavailableError when the underlying store throws on write", () => {
    const adapter = new MmkvStorageAdapter({
      local: createThrowingStore("encryption failure"),
      session: createMemoryStore(),
    });

    expect(() => adapter.setItem("k", "v", "local")).toThrow(StorageUnavailableError);
  });

  it("throws StorageUnavailableError when the underlying store throws on remove", () => {
    const adapter = new MmkvStorageAdapter({
      local: createMemoryStore(),
      session: createThrowingStore("session boom"),
    });

    expect(() => adapter.removeItem("k", "session")).toThrow(StorageUnavailableError);
  });
});
