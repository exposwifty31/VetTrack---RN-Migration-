import { createMMKV, type MMKV } from "react-native-mmkv";

import {
  createMemoryKvStore,
  MmkvStorageAdapter,
  type KvStore,
} from "./MmkvStorageAdapter";

function wrapMmkv(mmkv: MMKV): KvStore {
  return {
    getString(key) {
      return mmkv.getString(key);
    },
    set(key, value) {
      mmkv.set(key, value);
    },
    remove(key) {
      return mmkv.remove(key);
    },
  };
}

let singleton: MmkvStorageAdapter | null = null;

/** Production singleton: persistent MMKV (`vt.local`) + in-memory session. */
export function getDefaultStorageAdapter(): MmkvStorageAdapter {
  if (singleton) return singleton;
  singleton = new MmkvStorageAdapter({
    local: wrapMmkv(createMMKV({ id: "vt.local" })),
    session: createMemoryKvStore(),
  });
  return singleton;
}

/** Test-only: reset the production singleton between suites. */
export function __resetDefaultStorageAdapterForTests(): void {
  singleton = null;
}
