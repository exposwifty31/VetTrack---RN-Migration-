/**
 * W-AUTH PR-B: RN port of the web requested-role-store (C5) — the role chip a
 * user pre-picks on sign-in is carried to the future sign-up flow. Pure lib
 * over the safe-storage seam (session kind — mirrors web sessionStorage:
 * never a URL param, never part of a shareable link).
 */
import {
  REQUESTED_ROLE_STORAGE_KEY,
  readCarriedRole,
  writeCarriedRole,
} from "../requested-role-store";

import { StorageUnavailableError } from "@/infrastructure/storage/MmkvStorageAdapter";

const mockStore = new Map<string, string>();
const mockStorageState = { throws: false as false | "unavailable" | "other" };

function mockMaybeThrow(operation: "getItem" | "setItem" | "removeItem", key: string): void {
  if (mockStorageState.throws === "unavailable") {
    throw new StorageUnavailableError(operation, key, "session", "adapter missing");
  }
  if (mockStorageState.throws === "other") throw new Error("flaky storage backend");
}

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string, _kind?: string) => {
    mockMaybeThrow("getItem", key);
    return mockStore.has(key) ? mockStore.get(key)! : null;
  },
  safeStorageSetItem: (key: string, value: string, _kind?: string) => {
    mockMaybeThrow("setItem", key);
    mockStore.set(key, value);
    return true;
  },
  safeStorageRemoveItem: (key: string, _kind?: string) => {
    mockMaybeThrow("removeItem", key);
    mockStore.delete(key);
    return true;
  },
}));

beforeEach(() => {
  mockStore.clear();
  mockStorageState.throws = false;
});

describe("requested-role-store", () => {
  it("round-trips a chosen role", () => {
    writeCarriedRole("vet");
    expect(readCarriedRole()).toBe("vet");
    writeCarriedRole("technician");
    expect(readCarriedRole()).toBe("technician");
  });

  it("returns null when nothing is stored", () => {
    expect(readCarriedRole()).toBeNull();
  });

  it("validates stored values — garbage reads as null, never leaks through", () => {
    mockStore.set(REQUESTED_ROLE_STORAGE_KEY, "admin");
    expect(readCarriedRole()).toBeNull();
  });

  it("writeCarriedRole(null) clears the stored role", () => {
    writeCarriedRole("vet");
    writeCarriedRole(null);
    expect(readCarriedRole()).toBeNull();
    expect(mockStore.has(REQUESTED_ROLE_STORAGE_KEY)).toBe(false);
  });

  it("rethrows StorageUnavailableError — a missing adapter must fail loud, never no-op", () => {
    mockStorageState.throws = "unavailable";
    expect(() => readCarriedRole()).toThrow(StorageUnavailableError);
    expect(() => writeCarriedRole("vet")).toThrow(StorageUnavailableError);
    expect(() => writeCarriedRole(null)).toThrow(StorageUnavailableError);
  });

  it("degrades to null / no-op on nonessential storage errors (a nicety must never crash sign-in)", () => {
    mockStorageState.throws = "other";
    expect(readCarriedRole()).toBeNull();
    expect(() => writeCarriedRole("vet")).not.toThrow();
  });
});
