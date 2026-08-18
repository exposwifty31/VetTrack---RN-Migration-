/**
 * W-AUTH PR-B: RN port of the web requested-role-store (C5) — the role chip a
 * user pre-picks on sign-in is carried to the future sign-up flow. Pure lib
 * over the safe-storage seam (session kind — mirrors web sessionStorage:
 * never a URL param, never part of a shareable link).
 */
const store = new Map<string, string>();
let storageThrows = false;

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string, _kind?: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    return store.has(key) ? store.get(key)! : null;
  },
  safeStorageSetItem: (key: string, value: string, _kind?: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    store.set(key, value);
    return true;
  },
  safeStorageRemoveItem: (key: string, _kind?: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    store.delete(key);
    return true;
  },
}));

import {
  REQUESTED_ROLE_STORAGE_KEY,
  readCarriedRole,
  writeCarriedRole,
} from "../requested-role-store";

beforeEach(() => {
  store.clear();
  storageThrows = false;
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
    store.set(REQUESTED_ROLE_STORAGE_KEY, "admin");
    expect(readCarriedRole()).toBeNull();
  });

  it("writeCarriedRole(null) clears the stored role", () => {
    writeCarriedRole("vet");
    writeCarriedRole(null);
    expect(readCarriedRole()).toBeNull();
    expect(store.has(REQUESTED_ROLE_STORAGE_KEY)).toBe(false);
  });

  it("degrades to null / no-op when storage throws (a nicety must never crash sign-in)", () => {
    storageThrows = true;
    expect(readCarriedRole()).toBeNull();
    expect(() => writeCarriedRole("vet")).not.toThrow();
  });
});
