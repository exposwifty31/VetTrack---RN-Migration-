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
    // A URL record is only trusted when it is the canonical production tag:
    // exactly `https://vettrack.uk/equipment/<id>`. Reject foreign origins and
    // noncanonical paths (`/anything/equipment/<id>`) so an attacker-written tag
    // cannot smuggle an arbitrary id into the custody-confirmation flow.
    if (url.origin !== UNIVERSAL_LINK_ORIGIN) return null;
    // Match the pathname EXACTLY as `/equipment/<id>` — a split()+filter() drops the
    // trailing empty segment and would silently accept `/equipment/eq1/`.
    const match = /^\/equipment\/([^/]+)$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    // Not a URL → the documented bare-id pilot syntax (e.g. `eq1`).
    if (!trimmed.includes(" ") && trimmed.length > 0) return trimmed;
    return null;
  }
}
