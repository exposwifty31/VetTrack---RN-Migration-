/**
 * Framework-free key-value storage port.
 * Adapters must fail loud — never swallow read/write failures.
 */
export type StorageKind = "local" | "session";

export interface StoragePort {
  getItem(key: string, kind?: StorageKind): string | null;
  setItem(key: string, value: string, kind?: StorageKind): void;
  removeItem(key: string, kind?: StorageKind): void;
}
