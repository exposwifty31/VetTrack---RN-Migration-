import type { StorageKind, StoragePort } from "@/core/ports/storage.port";

/**
 * Minimal synchronous string store used by the adapter.
 * Local production path wraps MMKV; session is process-lifetime memory
 * (MMKV v4 has no in-memory mode — web sessionStorage is tab-scoped).
 */
export interface KvStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
}

export class StorageUnavailableError extends Error {
  readonly cause: unknown;

  constructor(operation: string, key: string, kind: StorageKind, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`StorageUnavailableError: ${operation} failed for key="${key}" kind=${kind}: ${detail}`);
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

export type MmkvStorageAdapterDeps = {
  local: KvStore;
  session: KvStore;
};

export class MmkvStorageAdapter implements StoragePort {
  private readonly stores: MmkvStorageAdapterDeps;

  constructor(deps: MmkvStorageAdapterDeps) {
    this.stores = deps;
  }

  getItem(key: string, kind: StorageKind = "local"): string | null {
    try {
      return this.stores[kind].getString(key) ?? null;
    } catch (cause) {
      throw new StorageUnavailableError("getItem", key, kind, cause);
    }
  }

  setItem(key: string, value: string, kind: StorageKind = "local"): void {
    try {
      this.stores[kind].set(key, value);
    } catch (cause) {
      throw new StorageUnavailableError("setItem", key, kind, cause);
    }
  }

  removeItem(key: string, kind: StorageKind = "local"): void {
    try {
      this.stores[kind].remove(key);
    } catch (cause) {
      throw new StorageUnavailableError("removeItem", key, kind, cause);
    }
  }
}

export function createMemoryKvStore(): KvStore {
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
