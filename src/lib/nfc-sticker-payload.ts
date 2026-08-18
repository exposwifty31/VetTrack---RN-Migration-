/**
 * Physical equipment-sticker payload — the ONE place that decides what bytes go
 * onto an NTAG215. Pure: no session, no native call, no React. Ported from the
 * Capacitor pair (`vettrack/src/lib/nfc-sticker-payload.ts`) with the same
 * two-record spec (`docs/g2-ntag-ndef-spec.md` §3).
 *
 * WHY THE LIBRARY BUILDS THE BYTES, NOT US: a well-known URI payload is
 * prefix-compressed (byte 0 is an index into the RTD protocol table — 0x04 is
 * "https://"), and hand-rolling that is exactly how a decode test goes falsely
 * green while the tag in the field carries a URL no reader resolves. So the
 * records come from `ndef-lib` — the same code that decodes them on the way back
 * in — via `Ndef.uriRecord` / `Ndef.androidApplicationRecord` / `encodeMessage`.
 *
 * RECORD ORDER IS LOAD-BEARING. `useNfcAdvisoryScan.decodeRecord0` reads
 * `records[0].payload` and nothing else, deliberately: a hostile tag must not be
 * able to append a second URL record and smuggle a different id past record 0.
 * The URI record is therefore first and the AAR second. iOS ignores the AAR;
 * Android uses it to open the app (or Play) from a cold start.
 */
import { Ndef, type NdefRecord } from "react-native-nfc-manager";

import { extractEquipmentId, UNIVERSAL_LINK_ORIGIN } from "@/lib/equipment-id";
import { ANDROID_APP_PACKAGE } from "@vettrack/shared";

/**
 * Thrown when the id cannot survive the reader's own parser. Deliberately a bare
 * `Error` with a stable message rather than a subclass: the caller branches on
 * this exact string, and the surrounding provisioning module maps it to copy.
 */
export const STICKER_ID_UNENCODABLE = "nfc_sticker_id_unencodable";

/**
 * The URL burned onto the sticker. ALWAYS the production universal-link origin —
 * a sticker is a physical artifact for the production fleet, so even this gate
 * build encodes the prod domain (the rule the QR writer already follows).
 *
 * `?nfcAction=toggle` is a UI hint that pre-fills the confirm sheet; it is not
 * authorization (ADR-006 — a human confirms downstream), and it lives in the
 * query string precisely so it stays out of `url.pathname`, which
 * `extractEquipmentId` matches exactly.
 */
export function buildEquipmentStickerUrl(equipmentId: string): string {
  return `${UNIVERSAL_LINK_ORIGIN}/equipment/${equipmentId}?nfcAction=toggle`;
}

/**
 * Record 0 = well-known URI (what both platforms read), record 1 = AAR.
 *
 * Self-checks the id against the REAL reader parser before returning bytes. An
 * id carrying `/`, `?`, `#`, or a space reshapes the URL, so the sticker would
 * decode to something other than the equipment it names — and unlike a bad HTTP
 * request that is a consumed physical tag plus a mis-bound row, discovered at
 * the counter by an operator with no way to undo it. Refusing costs nothing;
 * writing costs a tag. (Server ids are UUIDs — `validateUuid("id")` on PATCH
 * /:id — and pilot ids are bare alphanumerics, so this never fires in practice;
 * it is the guard for the case where it would matter.)
 */
export function buildEquipmentStickerRecords(equipmentId: string): NdefRecord[] {
  const url = buildEquipmentStickerUrl(equipmentId);
  if (extractEquipmentId(url) !== equipmentId) throw new Error(STICKER_ID_UNENCODABLE);
  return [Ndef.uriRecord(url), Ndef.androidApplicationRecord(ANDROID_APP_PACKAGE)];
}

/** The exact byte array handed to `ndefHandler.writeNdefMessage`. */
export function encodeEquipmentStickerMessage(equipmentId: string): number[] {
  return Ndef.encodeMessage(buildEquipmentStickerRecords(equipmentId));
}
