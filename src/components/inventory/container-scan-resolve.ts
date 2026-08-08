/**
 * Container NFC/QR scan fallback resolver (G3 Slice 10, seam §6.12) — pure
 * decision logic so the 404-fallthrough is unit-testable without the NFC stack.
 *
 * Firing point (verified against `useNfcAdvisoryScan` + `equipment-id.ts`):
 * `extractEquipmentId` returns ANY bare non-URL token AS an equipment id, so a
 * canonical equipment tag resolves to `status: "ok"` and never reaches here.
 * This resolver runs ONLY on the scan hook's `status: "no_id"` branch — a tag
 * whose record-0 payload is present but is not a canonical equipment URL.
 *
 * There is NO canonical container-tag URL scheme in the codebase (§6.12: verify
 * before trusting a format). So we treat any plausible token (non-empty, within
 * the server's 200-char `nfcTagId` bound) as a best-effort advisory lookup — the
 * server 404s anything that is not a real container tag, and we fall through to
 * the equipment text-search seed. A lookup that THROWS (network / flaky) must
 * never block the equipment path either.
 */
import type { ContainerWithItems } from "@/types/containers";

const MAX_NFC_TAG_LENGTH = 200;

export type ContainerScanOutcome =
  | Readonly<{ kind: "container"; container: ContainerWithItems }>
  | Readonly<{ kind: "equipment_search"; query: string }>;

export type ContainerLookup = (nfcTagId: string) => Promise<ContainerWithItems | null>;

export async function resolveContainerScan(
  payload: string,
  lookup: ContainerLookup,
): Promise<ContainerScanOutcome> {
  const tag = payload.trim();
  if (tag.length > 0 && tag.length <= MAX_NFC_TAG_LENGTH) {
    try {
      const container = await lookup(tag);
      if (container) return { kind: "container", container };
    } catch {
      // A failed lookup must never block the equipment fallback — fall through.
    }
  }
  return { kind: "equipment_search", query: payload };
}
