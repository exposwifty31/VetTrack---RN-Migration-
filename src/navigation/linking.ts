import type { LinkingOptions } from "@react-navigation/native";

import { UNIVERSAL_LINK_HOST } from "@/lib/equipment-id";

import type { RootStackParamList } from "./types";

/**
 * B1 deep-linking — the JS half of the universal-link + custom-scheme story.
 *
 * The native side (app.json) already declares `associatedDomains`
 * (`applinks:vettrack.uk`), the Android `autoVerify` intent filter for
 * `https://vettrack.uk/equipment/*`, and the `vettrack` scheme. Wiring this into
 * `<NavigationContainer linking={linking}>` is what makes a cold-boot from
 * `https://vettrack.uk/equipment/<id>` (or `vettrack://equipment/<id>`) actually
 * land on EquipmentDetail with the id preserved — instead of opening Home and
 * discarding it.
 *
 * Kept intentionally minimal (only the canonical equipment path B1 calls for);
 * additional routes can be added as their deep-link contracts are defined.
 *
 * NOTE (J11): Android App Links on-device verification stays blocked until the
 * Play signing fingerprint lands in `assetlinks.json`. That is a native/asset
 * concern (Phase 0.6 / owner-gated) — it does not affect this OS-agnostic config,
 * which iOS honors today and Android will honor once the fingerprint is served.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`https://${UNIVERSAL_LINK_HOST}`, "vettrack://"],
  config: {
    // Seat Home beneath a cold-boot deep-link target so Back returns to the app
    // rather than exiting — EquipmentDetail is a root-stack sibling of Main.
    initialRouteName: "Main",
    screens: {
      // Matches the canonical NFC / Universal-Link target
      // `https://vettrack.uk/equipment/<id>` (see extractEquipmentId).
      EquipmentDetail: "equipment/:equipmentId",
    },
  },
};
