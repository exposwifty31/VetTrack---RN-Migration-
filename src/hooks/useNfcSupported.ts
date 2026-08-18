/**
 * Does this device have usable NFC? The hardware gate for the provisioning card.
 *
 * Deliberately NOT folded into `useNfcAdvisoryScan`: that hook owns a READER
 * session and cancels it on unmount. A provisioning surface must own its own
 * write/lock session end to end, so it takes the capability probe and nothing
 * else. `NfcManager.start()` is idempotent, so the two hooks coexisting on
 * different screens is fine.
 *
 * `null` means "not determined yet" — distinct from `false`. The card renders
 * neither the affordance nor an "unsupported" message while it is null, so a
 * simulator or a slow probe never flashes a wrong answer.
 */
import { useEffect, useState } from "react";
import NfcManager from "react-native-nfc-manager";

export function useNfcSupported(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const ok = await NfcManager.isSupported();
        if (!active) return;
        if (!ok) {
          setSupported(false);
          return;
        }
        // `start()` BEFORE publishing: an affordance shown while the manager is
        // still initializing opens sessions that fail — and if start() then
        // rejects, the user has already seen a capability that does not exist.
        // (`start()` on a device without NFC throws on Android, which is why it
        // only runs behind the probe.)
        await NfcManager.start();
        if (active) setSupported(true);
      } catch {
        // A probe that throws is not evidence of capability. Fail closed: an
        // affordance that opens a session which can never succeed is worse than
        // no affordance.
        if (active) setSupported(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return supported;
}
