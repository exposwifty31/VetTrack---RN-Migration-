/**
 * The equipment-sticker ENCODER contract.
 *
 * These bytes are burned onto a physical NTAG215 that this app can never take
 * back once it is locked, so the encoder is pinned in BOTH directions: the
 * message this module produces must decode — through the very helpers the
 * reader uses — back to the equipment id it was asked to encode.
 *
 * The reader half is real, not restated: `useNfcAdvisoryScan.decodeRecord0`
 * takes `records[0].payload` ONLY and runs `Ndef.uri.decodePayload` →
 * `extractEquipmentId`. Every round-trip case below walks that exact path, so
 * "record 0 is the URI record" is a load-bearing assertion and not decoration —
 * putting the AAR first makes the reader decode a package name.
 *
 * `Ndef` here is the REAL `ndef-lib` (jest.setup.js delegates the mocked package
 * root to it), so encode and decode are the library's own, not a restatement of
 * the NDEF spec.
 */
import { Ndef } from "react-native-nfc-manager";

import { extractEquipmentId } from "../equipment-id";
import {
  buildEquipmentStickerRecords,
  buildEquipmentStickerUrl,
  encodeEquipmentStickerMessage,
} from "../nfc-sticker-payload";

/** A real server id (`validateUuid` gates PATCH /:id) and the pilot bare id. */
const UUID_ID = "3f1c9a52-7b0e-4d21-9f6a-1c8b0d5e2a44";
const PILOT_ID = "eq1";

/** ASCII-only by construction (a Java package name) — safe to read back this way. */
function payloadToAscii(payload: number[]): string {
  return String.fromCharCode(...payload);
}

/**
 * The reader path, verbatim: record 0's payload → `Ndef.uri.decodePayload` →
 * `extractEquipmentId` (`useNfcAdvisoryScan.ts:24-33`).
 */
function readBackEquipmentId(bytes: number[]): string | null {
  const records = Ndef.decodeMessage(bytes);
  const url = Ndef.uri.decodePayload(new Uint8Array(records[0]!.payload));
  return extractEquipmentId(url);
}

describe("equipment sticker URL", () => {
  it("is the canonical production universal link with the toggle hint", () => {
    expect(buildEquipmentStickerUrl(PILOT_ID)).toBe(
      "https://vettrack.uk/equipment/eq1?nfcAction=toggle",
    );
  });

  it("uses the PRODUCTION origin even though this is the gate build", () => {
    // A sticker is a physical artifact for the production fleet; there is no
    // per-environment tag origin (equipment-id.ts UNIVERSAL_LINK_ORIGIN).
    expect(buildEquipmentStickerUrl(UUID_ID).startsWith("https://vettrack.uk/equipment/")).toBe(
      true,
    );
  });
});

describe("equipment sticker records", () => {
  it("puts the well-known URI record FIRST — the reader decodes records[0] only", () => {
    const [record0] = buildEquipmentStickerRecords(PILOT_ID);
    expect(record0!.tnf).toBe(Ndef.TNF_WELL_KNOWN);
    expect(record0!.type).toEqual(Ndef.RTD_URI);
    // 0x04 is the RTD prefix index for "https://" — the compression the reader
    // undoes. A payload starting with 'h' would mean the prefix table was bypassed.
    expect(record0!.payload[0]).toBe(0x04);
  });

  it("appends the Android Application Record so a cold Android phone opens the app", () => {
    const [, record1] = buildEquipmentStickerRecords(PILOT_ID);
    expect(record1!.tnf).toBe(Ndef.TNF_EXTERNAL_TYPE);
    expect(record1!.type).toBe("android.com:pkg");
    expect(payloadToAscii(record1!.payload)).toBe("uk.vettrack.app");
  });

  it("writes exactly two records — no more, no fewer", () => {
    expect(buildEquipmentStickerRecords(UUID_ID)).toHaveLength(2);
  });
});

describe("encodeEquipmentStickerMessage round-trips through the reader path", () => {
  it("a bare pilot id survives encode → decode → extractEquipmentId", () => {
    expect(readBackEquipmentId(encodeEquipmentStickerMessage(PILOT_ID))).toBe(PILOT_ID);
  });

  it("a server UUID survives encode → decode → extractEquipmentId", () => {
    expect(readBackEquipmentId(encodeEquipmentStickerMessage(UUID_ID))).toBe(UUID_ID);
  });

  it("the decoded URL keeps the ?nfcAction=toggle hint the deep link reads", () => {
    const records = Ndef.decodeMessage(encodeEquipmentStickerMessage(UUID_ID));
    const url = Ndef.uri.decodePayload(new Uint8Array(records[0]!.payload));
    expect(url).toBe(`https://vettrack.uk/equipment/${UUID_ID}?nfcAction=toggle`);
  });

  it("the AAR survives the encode/decode round trip as record 1", () => {
    const records = Ndef.decodeMessage(encodeEquipmentStickerMessage(UUID_ID));
    expect(records).toHaveLength(2);
    expect(payloadToAscii(records[1]!.payload)).toBe("uk.vettrack.app");
  });

  it("fits an NTAG213 (144 bytes user memory) — the smallest tag we might be handed", () => {
    // NTAG215 (504 B) is what was ordered, but a mis-shipped NTAG213 must still
    // take the sticker rather than fail at the counter.
    expect(encodeEquipmentStickerMessage(UUID_ID).length).toBeLessThanOrEqual(144);
  });
});

describe("encoder refuses an id it cannot read back", () => {
  // A sticker that does not decode to the id it was written for is a bricked
  // physical tag AND a mis-bound equipment row. The encoder self-checks against
  // the real parser rather than trusting template interpolation.
  it.each([
    ["a slash (reshapes the path)", "eq/1"],
    ["a question mark (swallows the rest into the query)", "eq?1"],
    ["a hash (swallows the rest into the fragment)", "eq#1"],
    ["a space (percent-encodes in the pathname)", "eq 1"],
    ["empty", ""],
  ])("throws on %s", (_label, hostileId) => {
    expect(() => encodeEquipmentStickerMessage(hostileId)).toThrow(/unencodable/i);
  });

  it("names the failure in a way the caller can branch on", () => {
    expect(() => buildEquipmentStickerRecords("eq/1")).toThrow(
      "nfc_sticker_id_unencodable",
    );
  });
});
