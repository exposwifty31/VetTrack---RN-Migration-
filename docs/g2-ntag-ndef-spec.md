# NTAG Equipment-Sticker NDEF Payload Spec

Source of truth: web repo `src/lib/nfc-sticker-payload.ts` + `src/lib/nfc-capgo-decode.ts`. This spec fixes the exact bytes a physical equipment sticker carries and how the RN app reads them. Writing one production sticker per this spec **closes G1 slice 8** and supplies the tag for the G2 blind scan→checkout.

**Source revision (MUST pin before writing production stickers):** the byte layout below is defined by the two web-repo files above, which are **not** vendored into this repo — so the bytes here can silently drift from the code that actually writes them. Before writing any production tag, pin the source and a canonical fixture here:

- Web-repo commit SHA (validated against): `<filled by owner before first production write>`
- Canonical record-0 URL fixture: `https://vettrack.uk/equipment/eq1?nfcAction=toggle`
- Canonical byte fixture / SHA-256 of the encoded NDEF message: `<filled by owner from the pinned web-repo commit>`
- **Reader-side** round-trip is pinned in this repo by `src/lib/__tests__/equipment-id.test.ts` (canonical URL → `eq1`, foreign origins/noncanonical paths rejected). The **writer-side** byte fixture must be asserted in the web repo's writer test against the pinned commit before a production write.

## 1. Record layout (2 records, order is load-bearing)

**Record 0 — Well-known URI (what iOS background reading + the RN foreground parser consume):**

- TNF `0x01` (well-known), type `0x55` (`'U'`).
- Payload = `[prefixCode] + rest`. For an `https://` URL the prefix code is the index of `"https://"` in `["","http://www.","https://www.","http://","https://"]` = **`0x04`**; `rest` = the URL with `https://` stripped.
- URL = `https://vettrack.uk/equipment/{equipmentId}?nfcAction=toggle` (always the PRODUCTION origin, even for dev/gate builds — a sticker is a physical artifact).
- So `rest` = `vettrack.uk/equipment/{equipmentId}?nfcAction=toggle`.

**Record 1 — Android Application Record (AAR):**

- TNF `0x04` (external type), type = ASCII `"android.com:pkg"`, payload = ASCII `"uk.vettrack.app"` (`ANDROID_APP_PACKAGE`).
- iOS ignores the AAR (background reading parses record 0 only). On Android with no app installed it routes to the Play listing; with the app installed it removes the app-chooser.

## 2. Read path (RN app) — foreground only

The RN gate build is `uk.vettrack.rnmigration`, but the AAR and the universal-link association (AASA `87F5G378M6.uk.vettrack.app`, assetlinks `uk.vettrack.app`) all point at the CAPACITOR app. **OS background tag dispatch / universal links therefore never open the RN app.** This is by design and does not need a sticker change:

- The RN app reads via a **foreground** `NfcManager.requestTechnology(NfcTech.Ndef)` session (already proven in `NfcSpikeScreen`). A foreground reader session pre-empts background dispatch on both iOS (`NFCNDEFReaderSession`) and Android (reader mode).
- Parse **record 0** only: reconstruct the URL (re-expand prefix code `0x04` → `https://`), extract `equipmentId` from the path segment after `/equipment/`. **Ignore the AAR.** One production sticker thus serves both apps.
- NFC stays **advisory (frozen surface):** the read PRE-FILLS the checkout sheet; a human confirms; custody is never auto-committed. `?nfcAction=toggle` is a UI hint, not an authorization.
- Hand the extracted id to the hero action `POST /api/equipment/scan` (`{equipmentId}`), NOT `/:id/toggle`. If the payload id doesn't match the expected id format, fall back to `equipment.list({q: payload})`.

## 3. Tag capacity — choose NTAG213 vs NTAG215

Byte budget (usable NDEF, approx):

- Record 0 (short-record header 4B + payload `1 + len(rest)`): `rest` fixed portion = `vettrack.uk/equipment/` (22) + `?nfcAction=toggle` (17) = 39B + id length → record = 4 + 1 + 39 + idLen = **`44 + idLen`** B.
- Record 1 AAR (header 3B + type 15B + payload 15B) ≈ **33B**.
- NDEF TLV wrapper ≈ **4B**.
- **Short pilot id (`"eq1"`, idLen 3, which `/scan` accepts):** (44 + 3) + 33 + 4 ≈ **84B**.
- **36-char UUID id:** (44 + 36) + 33 + 4 ≈ **117B** — within NTAG213's ~137B usable, but only ~20B margin.

**Rule:** NTAG213 (~137B usable) is sufficient **only if equipment ids are confirmed short** (pilot-style `eqN`). If ids can be UUIDs, use **NTAG215 (~504B usable)** for comfortable margin (a UUID leaves only ~20B on an NTAG213). (Resolves the NTAG213-vs-215 disagreement between `G2-PLAN.md` §5.4 and the code comment.)

## 4. Write procedure & landmine

- Write both records atomically; a non-compliant sticker (missing AAR) fails the whole write per the audit spec.
- **Patch landmine:** `react-native-nfc-manager@3.17.2` requires its local #833 getTag-guard patch (`patches/react-native-nfc-manager+3.17.2.patch`). After any fresh install, re-run `patch-package` or the slice-8 read path re-crashes (SIGABRT under New Arch).
- Verify a written tag by reading it back through the RN foreground path and confirming the extracted id round-trips.
