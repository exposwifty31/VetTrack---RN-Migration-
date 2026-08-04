/**
 * Pure equipment-id extraction — ported verbatim (behavior-identical) from the web
 * repo `src/lib/equipment-id.ts`. Zero heavy imports; safe to run in a worklet-free
 * JS path. Deliberately does NOT port anything that auto-commits custody
 * (nfc-equipment-toggle.ts is excluded — NFC read is advisory-only, ADR-006).
 *
 * The production NFC sticker's record 0 is a well-known URI:
 *   https://vettrack.uk/equipment/{equipmentId}?nfcAction=toggle
 * `extractEquipmentId` returns the path segment after `/equipment/`. When the raw
 * value is not a URL it is treated as a bare id (pilot ids like `eq1`).
 */

// Single canonical PRODUCTION origin for NFC tags + Universal Links. NFC tags are
// physical artifacts for the production fleet, so even a dev/gate build encodes the
// prod UL domain — there is no per-environment tag origin.
export const UNIVERSAL_LINK_ORIGIN = "https://vettrack.uk";
export const UNIVERSAL_LINK_HOST = "vettrack.uk";

export function extractEquipmentId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/");
    const idx = parts.indexOf("equipment");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return null;
  } catch {
    if (!trimmed.includes(" ") && trimmed.length > 0) return trimmed;
    return null;
  }
}
