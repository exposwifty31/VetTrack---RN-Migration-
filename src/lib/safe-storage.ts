import type { StorageKind } from "@/core/ports/storage.port";
import { getDefaultStorageAdapter } from "@/infrastructure/storage/defaultStorage";

/**
 * RN stand-in for vettrack's safeStorage* helpers.
 * Signature-compatible for ported call sites; failures propagate as
 * StorageUnavailableError (fail-loud). Best-effort callers (e.g. emergency
 * telemetry buffer) must try/catch at the call site — the port never swallows.
 */
export function safeStorageGetItem(key: string, kind: StorageKind = "local"): string | null {
  return getDefaultStorageAdapter().getItem(key, kind);
}

export function safeStorageSetItem(
  key: string,
  value: string,
  kind: StorageKind = "local",
): boolean {
  getDefaultStorageAdapter().setItem(key, value, kind);
  return true;
}

export function safeStorageRemoveItem(key: string, kind: StorageKind = "local"): boolean {
  getDefaultStorageAdapter().removeItem(key, kind);
  return true;
}
