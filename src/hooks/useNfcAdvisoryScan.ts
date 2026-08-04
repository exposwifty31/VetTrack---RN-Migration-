/**
 * Advisory NFC read (ADR-006 frozen surface): a foreground reader session that
 * decodes the equipment id from the sticker and hands it back to the caller to
 * PRE-FILL the confirm sheet. It NEVER calls scan/toggle — `?nfcAction=toggle` is a
 * UI hint, not authorization. A human confirms downstream.
 *
 * Foreground `requestTechnology(NfcTech.Ndef)` pre-empts OS background dispatch
 * (which resolves to the Capacitor app via the AAR/universal-link association), so
 * this works despite the RN gate build's different bundle id. The session is always
 * cancelled in `finally`. NFC hardware does not exist on the simulator.
 */
import { useCallback, useEffect, useState } from "react";
import NfcManager, { Ndef, NfcTech, type NdefRecord } from "react-native-nfc-manager";

import { extractEquipmentId } from "@/lib/equipment-id";

/** Try to decode a URL record and pull an equipment id out of it. */
function idFromRecord(record: NdefRecord): string | null {
  const payload = record?.payload;
  if (!payload || payload.length === 0) return null;
  try {
    const url = Ndef.uri.decodePayload(new Uint8Array(payload));
    return extractEquipmentId(url);
  } catch {
    return null;
  }
}

/**
 * A read either yields an id, completes with no id on the tag, or the reader
 * session itself rejected (cancel / tag lost / hardware). The three are distinct
 * so the caller can surface `scan.readFailed` vs `scan.noId`.
 */
export type NfcScanResult =
  | { status: "ok"; equipmentId: string }
  | { status: "no_id" }
  | { status: "read_failed" };

export type NfcAdvisoryScan = {
  supported: boolean | null;
  reading: boolean;
  scan: () => Promise<NfcScanResult>;
};

export function useNfcAdvisoryScan(): NfcAdvisoryScan {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const ok = await NfcManager.isSupported();
        if (!active) return;
        setSupported(ok);
        if (ok) await NfcManager.start();
      } catch {
        if (active) setSupported(false);
      }
    })();
    return () => {
      active = false;
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  const scan = useCallback(async (): Promise<NfcScanResult> => {
    setReading(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const records: NdefRecord[] = tag?.ndefMessage ?? [];
      for (const record of records) {
        const id = idFromRecord(record);
        if (id) return { status: "ok", equipmentId: id };
      }
      return { status: "no_id" };
    } catch {
      // requestTechnology()/getTag() reject on user cancel, tag lost, or a
      // hardware error — surface these as a read failure, not a "no id" tag.
      return { status: "read_failed" };
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setReading(false);
    }
  }, []);

  return { supported, reading, scan };
}
