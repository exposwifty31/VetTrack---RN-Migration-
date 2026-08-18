/**
 * Sticker PROVISIONING — program an equipment sticker, and (separately)
 * permanently lock it. The RN port of the Capacitor pair
 * (`vettrack/src/lib/nfc-platform.ts:265-316` + `src/lib/nfc-lock.ts`), rebuilt
 * on `react-native-nfc-manager`'s `ndefHandler`.
 *
 * This is the ONLY surface in the app that writes to a tag. Reading stays
 * advisory (ADR-006, `useNfcAdvisoryScan`): a tag never grants custody. Writing
 * and locking are identification concerns and confer no authority either.
 *
 * ── THREE THINGS THE LIBRARY DOES NOT GIVE US, REBUILT HERE ──────────────────
 *
 * 1. IDEMPOTENT LOCK. `NfcLockPlugin.swift:96,104-122` queries NDEF status first
 *    and treats `.readOnly` as success — "an operator re-tapping must not see a
 *    failure". nfc-manager has no equivalent: iOS `writeLock` on a locked tag
 *    errors (NfcManager.m:512-514) and Android's `Ndef.makeReadOnly()` returns
 *    false or throws (NfcManager.java:679). So `getNdefStatus()` runs first and
 *    `ReadOnly` short-circuits to success. Locking is one-way; a re-tap reading
 *    as a failure is a field-trust problem, not a cosmetic one.
 *
 * 2. AN HONEST LOCK RESULT. `ndefHandler.makeReadOnly()` is declared
 *    `Promise<void>` (index.d.ts:97) — a type lie on Android, where the native
 *    callback carries TWO args (NfcManager.java:680) and `callNative` resolves
 *    arg[1], i.e. the boolean from `Ndef.makeReadOnly()`. `false` means the tag
 *    is STILL WRITABLE. iOS resolves `undefined` (one-arg callback,
 *    NfcManager.m:516). So `false` is rejected explicitly and the status is
 *    re-read afterwards. Doctrine ported verbatim from `nfc-lock.ts:36-39`:
 *    never resolve on a failed lock — "a sticker reported as locked but still
 *    writable is the field risk the lock exists to remove."
 *
 * 3. A BOUNDED WAIT. Android runs reader mode with no system UI at all, so a
 *    session where no tag is ever presented leaves the radio on and the promise
 *    pending forever. `cancelTechnologyRequest()` is the breaker. The bound is
 *    deliberately longer than iOS's own ~60s session so the OS still wins on
 *    iOS and native behaviour there is unchanged; the timer is the Android
 *    backstop. Either way the session is closed exactly once.
 *
 * ── WHAT IS NOT PROVEN ───────────────────────────────────────────────────────
 * Nothing below has run against a physical tag. `writeNdefMessage`,
 * `makeReadOnly` and `queryNDEFStatus` are three RCT_EXPORT_METHODs this
 * codebase has never invoked, reached through the New-Architecture bridgeless
 * interop layer. The read path working under interop is not evidence for them.
 */
import NfcManager, { NdefStatus, NfcTech } from "react-native-nfc-manager";

import { encodeEquipmentStickerMessage, STICKER_ID_UNENCODABLE } from "@/lib/nfc-sticker-payload";

export type NfcProvisionErrorCode =
  /** The id cannot survive the reader's parser — refused before any tag is asked for. */
  | "id_unencodable"
  /** Another write/lock is already holding a session. */
  | "busy"
  /** `requestTechnology` rejected: user cancel, tag lost, NFC off, no hardware. */
  | "session_failed"
  /** No tag presented within {@link NFC_SESSION_TIMEOUT_MS}. */
  | "timeout"
  /** The tag refused the NDEF write. */
  | "write_failed"
  /** Status is neither ReadWrite nor ReadOnly — unknown, unformatted, or an Android read error. */
  | "not_lockable"
  /** The lock was attempted and did NOT take (or the tag rejected it). */
  | "lock_failed";

export class NfcProvisionError extends Error {
  constructor(
    readonly code: NfcProvisionErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "NfcProvisionError";
  }
}

/**
 * Upper bound on "hold the sticker to the phone". Longer than iOS's own NFC
 * session (~60s) on purpose — see (3) in the header.
 */
export const NFC_SESSION_TIMEOUT_MS = 75_000;

/**
 * Module-level single-flight guard, mirroring `androidLockInFlight`
 * (nfc-lock.ts:33). The UI already disables its trigger while a call is in
 * flight, but the module must not depend on that alone: a second surface, a
 * retry, or a stale button must not open a second session over the first.
 */
let provisioningInFlight = false;

/** Native returns UPPERCASE hex on both platforms; the row is keyed on lowercase. */
function normalizeTagUid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.trim().toLowerCase();
  // Only bind something that is actually a UID. Anything else would create a
  // junk row under a globally-unique index we cannot easily clear.
  return /^[0-9a-f]+$/.test(hex) ? hex : null;
}

/**
 * Open the Ndef session, bounded. On timeout the pending `requestTechnology` is
 * broken by cancelling the request; its own rejection is absorbed so it cannot
 * surface as an unhandled rejection after we have already thrown.
 */
async function openSession(alertMessage?: string): Promise<void> {
  const request = NfcManager.requestTechnology(
    NfcTech.Ndef,
    alertMessage ? { alertMessage } : undefined,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      reject(new NfcProvisionError("timeout"));
    }, NFC_SESSION_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      request.catch((cause: unknown) => {
        throw new NfcProvisionError("session_failed", { cause });
      }),
      bound,
    ]);
  } finally {
    clearTimeout(timer);
    // The loser of the race still settles; swallow it so a late rejection from
    // the cancelled request never escapes as unhandled.
    void Promise.resolve(request).catch(() => {});
    void bound.catch(() => {});
  }
}

/** Run `body` inside exactly one Ndef session, single-flight, always closed. */
async function withSession<T>(alertMessage: string | undefined, body: () => Promise<T>): Promise<T> {
  if (provisioningInFlight) throw new NfcProvisionError("busy");
  provisioningInFlight = true;
  try {
    // A session that never opened has nothing to cancel — and cancelling here
    // would make the `busy` / timeout accounting ambiguous.
    await openSession(alertMessage);
    try {
      return await body();
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  } finally {
    provisioningInFlight = false;
  }
}

export type NfcWriteResult = {
  /**
   * The tag's physical UID as lowercase hex, or `null` when the tag exposes
   * none. `null` means "written, but nothing to bind" — the caller reports the
   * write as a success and skips the bind, exactly as the Capacitor Web-NFC
   * path does (`nfc-platform.ts:277`).
   */
  tagId: string | null;
};

/**
 * Program an equipment sticker. Both spec records go on together — a tag
 * carrying only the URI record is a non-compliant sticker, so a partial write is
 * a failed write, never a half-programmed tag.
 *
 * The payload is encoded BEFORE the session opens: an id that cannot read back
 * must never cost the operator a physical tag.
 */
export async function writeEquipmentStickerTag(
  equipmentId: string,
  alertMessage?: string,
): Promise<NfcWriteResult> {
  let bytes: number[];
  try {
    bytes = encodeEquipmentStickerMessage(equipmentId);
  } catch (cause) {
    if (cause instanceof Error && cause.message === STICKER_ID_UNENCODABLE) {
      throw new NfcProvisionError("id_unencodable", { cause });
    }
    throw cause;
  }

  return withSession(alertMessage, async () => {
    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    } catch (cause) {
      throw new NfcProvisionError("write_failed", { cause });
    }
    // Read the UID only after the write succeeded, so a returned UID is always
    // the UID of a tag this call actually programmed.
    const tag = await NfcManager.getTag().catch(() => null);
    return { tagId: normalizeTagUid(tag?.id) };
  });
}

export type NfcLockResult = {
  /** True when the tag was ALREADY read-only — success, and the copy says so. */
  alreadyLocked: boolean;
};

/**
 * Permanently lock the presented sticker. Irreversible on real hardware: an
 * NTAG215 lock can never be undone, so the caller must confirm with the operator
 * first (the card gates this behind an explicit two-step arm + confirm).
 */
export async function lockEquipmentStickerTag(alertMessage?: string): Promise<NfcLockResult> {
  return withSession(alertMessage, async () => {
    const before = await NfcManager.ndefHandler.getNdefStatus().catch((cause: unknown) => {
      throw new NfcProvisionError("not_lockable", { cause });
    });

    // Idempotent branch — NfcLockPlugin.swift:117-122.
    if (before.status === NdefStatus.ReadOnly) return { alreadyLocked: true };

    // Anything that is not explicitly ReadWrite is UNKNOWN, not lockable. On
    // Android a transient read failure is swallowed into NotSupported
    // (NdefHandler.js:41-47), so `!== ReadOnly` would attempt a lock on an error.
    if (before.status !== NdefStatus.ReadWrite) throw new NfcProvisionError("not_lockable");

    let result: unknown;
    try {
      result = await NfcManager.ndefHandler.makeReadOnly();
    } catch (cause) {
      throw new NfcProvisionError("lock_failed", { cause });
    }
    // Android's honest `false`. iOS resolves `undefined`, which passes.
    if (result === false) throw new NfcProvisionError("lock_failed");

    // Same session, so this is free — and it is the only direct evidence that
    // the lock took rather than the call merely returning.
    const after = await NfcManager.ndefHandler.getNdefStatus().catch((cause: unknown) => {
      throw new NfcProvisionError("lock_failed", { cause });
    });
    if (after.status !== NdefStatus.ReadOnly) throw new NfcProvisionError("lock_failed");

    return { alreadyLocked: false };
  });
}
