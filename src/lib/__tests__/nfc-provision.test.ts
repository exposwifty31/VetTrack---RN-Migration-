/**
 * The sticker PROVISIONING state machine — write, then (separately) lock.
 *
 * Every native call here is mocked (`jest.setup.js` exposes `default.ndefHandler`
 * and the real `NdefStatus` enum), so what these tests prove is the ORDER and the
 * GUARDS, not the hardware. That is deliberate: the two failure modes this module
 * exists to prevent are both logic, not radio —
 *
 *   1. reporting a lock that did not take. `ndefHandler.makeReadOnly()` is typed
 *      `Promise<void>` but on Android resolves the boolean from
 *      `Ndef.makeReadOnly()` (NfcManager.java:679-680 invokes the callback with
 *      TWO args, and callNative resolves arg[1]); `false` means the tag is still
 *      writable. iOS resolves `undefined` (one-arg callback, NfcManager.m:516).
 *      Awaiting and reporting success is a correctness bug on Android.
 *   2. failing an operator who re-taps an already-locked sticker. The Capacitor
 *      pair gets idempotence from `queryNDEFStatus` + the `.readOnly` branch
 *      (NfcLockPlugin.swift:96,117-122); react-native-nfc-manager gives none of
 *      that for free — iOS `writeLock` on a locked tag errors, Android returns
 *      false. It has to be rebuilt here.
 *
 * What these tests CANNOT prove is stated in the module header and in the task
 * write-up: no physical tag is involved, and none of these three RCT methods has
 * ever been invoked from this codebase.
 */
import NfcManager, { NdefStatus, NfcTech } from "react-native-nfc-manager";

import {
  cancelNfcProvisioning,
  lockEquipmentStickerTag,
  NFC_SESSION_TIMEOUT_MS,
  NfcProvisionError,
  writeEquipmentStickerTag,
} from "../nfc-provision";
import { encodeEquipmentStickerMessage } from "../nfc-sticker-payload";

const EQUIPMENT_ID = "3f1c9a52-7b0e-4d21-9f6a-1c8b0d5e2a44";

/** The mocked native surface, typed loosely — these are jest.fn()s from jest.setup.js. */
const native = NfcManager as unknown as {
  requestTechnology: jest.Mock;
  cancelTechnologyRequest: jest.Mock;
  getTag: jest.Mock;
  ndefHandler: {
    writeNdefMessage: jest.Mock;
    makeReadOnly: jest.Mock;
    getNdefStatus: jest.Mock;
  };
};

function resetNative() {
  native.requestTechnology.mockReset().mockResolvedValue(undefined);
  native.cancelTechnologyRequest.mockReset().mockResolvedValue(undefined);
  native.getTag.mockReset().mockResolvedValue(null);
  native.ndefHandler.writeNdefMessage.mockReset().mockResolvedValue(undefined);
  native.ndefHandler.makeReadOnly.mockReset().mockResolvedValue(undefined);
  native.ndefHandler.getNdefStatus
    .mockReset()
    .mockResolvedValue({ status: NdefStatus.NotSupported, capacity: 0 });
}

/** Stage the status reads a lock performs: pre-check, then the post-lock re-read. */
function stageStatuses(...statuses: number[]) {
  native.ndefHandler.getNdefStatus.mockReset();
  for (const status of statuses) {
    native.ndefHandler.getNdefStatus.mockResolvedValueOnce({ status, capacity: 504 });
  }
}

beforeEach(resetNative);

describe("writeEquipmentStickerTag", () => {
  it("writes the encoder's exact bytes inside one Ndef session", async () => {
    native.getTag.mockResolvedValue({ id: "04A2B3C4D5E680" });

    const result = await writeEquipmentStickerTag(EQUIPMENT_ID);

    expect(native.requestTechnology).toHaveBeenCalledTimes(1);
    expect(native.requestTechnology.mock.calls[0]![0]).toBe(NfcTech.Ndef);
    expect(native.ndefHandler.writeNdefMessage).toHaveBeenCalledWith(
      encodeEquipmentStickerMessage(EQUIPMENT_ID),
    );
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(result.tagId).not.toBeNull();
  });

  it("normalizes the tag UID to lowercase hex so it matches a Capacitor-written row", () => {
    // Native returns UPPERCASE on both platforms (ios/Util.m:16 "%02lX";
    // android Util.java:19 hexArray = "0123456789ABCDEF"), but the Capacitor
    // writer binds LOWERCASE (nfc-capgo-decode.ts:24 toString(16)). The server's
    // uniqueness index on nfcTagId is byte-exact, so the same physical sticker
    // written by the two apps would otherwise occupy two different rows.
    native.getTag.mockResolvedValue({ id: "04A2B3C4D5E680" });
    return expect(writeEquipmentStickerTag(EQUIPMENT_ID)).resolves.toEqual({
      tagId: "04a2b3c4d5e680",
    });
  });

  it("resolves tagId null when the tag exposes no UID — write succeeded, bind is skipped", async () => {
    native.getTag.mockResolvedValue({ ndefMessage: [] });
    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).resolves.toEqual({ tagId: null });
  });

  it("resolves tagId null rather than binding a non-hex UID", async () => {
    native.getTag.mockResolvedValue({ id: "not-a-uid" });
    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).resolves.toEqual({ tagId: null });
  });

  it("refuses an unencodable id WITHOUT opening a session", async () => {
    // The operator must never be prompted to present a physical tag for a write
    // that cannot possibly read back — the tag would be consumed for nothing.
    await expect(writeEquipmentStickerTag("eq/1")).rejects.toMatchObject({
      code: "id_unencodable",
    });
    expect(native.requestTechnology).not.toHaveBeenCalled();
  });

  it("surfaces a native write rejection as write_failed and still closes the session", async () => {
    native.ndefHandler.writeNdefMessage.mockRejectedValue(new Error("tag lost"));

    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).rejects.toMatchObject({
      code: "write_failed",
    });
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("surfaces a session that never opens as session_failed and does not write", async () => {
    native.requestTechnology.mockRejectedValue(new Error("user cancelled"));

    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).rejects.toMatchObject({
      code: "session_failed",
    });
    expect(native.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });
});

describe("lockEquipmentStickerTag — idempotence", () => {
  it("reports an already-locked sticker as SUCCESS without attempting a lock", async () => {
    // NfcLockPlugin.swift:117-122 — "an operator re-tapping must not see a
    // failure". Attempting writeLock on a read-only tag errors on iOS, so the
    // status pre-check is what makes the re-tap succeed.
    stageStatuses(NdefStatus.ReadOnly);

    await expect(lockEquipmentStickerTag()).resolves.toEqual({ alreadyLocked: true });
    expect(native.ndefHandler.makeReadOnly).not.toHaveBeenCalled();
  });

  it("locks a writable tag and confirms the status flipped", async () => {
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadOnly);

    await expect(lockEquipmentStickerTag()).resolves.toEqual({ alreadyLocked: false });
    expect(native.ndefHandler.makeReadOnly).toHaveBeenCalledTimes(1);
  });

  it("refuses a tag whose status is NotSupported instead of attempting a lock", async () => {
    // Android's getNdefStatus SWALLOWS read errors into NotSupported
    // (NdefHandler.js:41-47), so this state is "unknown", not "lockable".
    stageStatuses(NdefStatus.NotSupported);

    await expect(lockEquipmentStickerTag()).rejects.toMatchObject({ code: "not_lockable" });
    expect(native.ndefHandler.makeReadOnly).not.toHaveBeenCalled();
  });
});

describe("lockEquipmentStickerTag — never resolve on a failed lock", () => {
  it("throws when Android resolves false from Ndef.makeReadOnly()", async () => {
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadOnly);
    native.ndefHandler.makeReadOnly.mockResolvedValue(false);

    await expect(lockEquipmentStickerTag()).rejects.toMatchObject({ code: "lock_failed" });
  });

  it("accepts the iOS undefined resolution as success", async () => {
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadOnly);
    native.ndefHandler.makeReadOnly.mockResolvedValue(undefined);

    await expect(lockEquipmentStickerTag()).resolves.toEqual({ alreadyLocked: false });
  });

  it("throws when the post-lock re-read says the tag is still writable", async () => {
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadWrite);

    await expect(lockEquipmentStickerTag()).rejects.toMatchObject({ code: "lock_failed" });
  });

  it("surfaces a native lock rejection as lock_failed", async () => {
    stageStatuses(NdefStatus.ReadWrite);
    native.ndefHandler.makeReadOnly.mockRejectedValue(new Error("tag lost"));

    await expect(lockEquipmentStickerTag()).rejects.toMatchObject({ code: "lock_failed" });
  });
});

describe("lockEquipmentStickerTag — session discipline", () => {
  it("runs status → lock → re-read inside ONE session", async () => {
    // Reopening between the pre-check and the lock would let a DIFFERENT tag be
    // presented in the gap and permanently locked.
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadOnly);

    await lockEquipmentStickerTag();

    expect(native.requestTechnology).toHaveBeenCalledTimes(1);
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it("closes the session even when the pre-check refuses the tag", async () => {
    stageStatuses(NdefStatus.NotSupported);

    await expect(lockEquipmentStickerTag()).rejects.toThrow();
    expect(native.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });
});

describe("provisioning is single-flight", () => {
  it("rejects a second call while one is already in flight", async () => {
    let releaseSession: () => void = () => {};
    native.requestTechnology.mockImplementation(
      () => new Promise<void>((resolve) => (releaseSession = resolve)),
    );
    stageStatuses(NdefStatus.ReadWrite, NdefStatus.ReadOnly);

    const first = lockEquipmentStickerTag();
    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).rejects.toMatchObject({ code: "busy" });

    releaseSession();
    await first;
    // The busy rejection must not have opened, or closed, anything of its own.
    expect(native.requestTechnology).toHaveBeenCalledTimes(1);
  });

  it("clears the single-flight guard after a failure so a retry can proceed", async () => {
    native.requestTechnology.mockRejectedValueOnce(new Error("user cancelled"));
    await expect(writeEquipmentStickerTag(EQUIPMENT_ID)).rejects.toThrow();

    stageStatuses(NdefStatus.ReadOnly);
    await expect(lockEquipmentStickerTag()).resolves.toEqual({ alreadyLocked: true });
  });
});

describe("a session that never sees a tag is bounded", () => {
  // Android runs reader mode with NO system UI, so an unbounded wait leaves the
  // radio on and the button dead forever. `cancelTechnologyRequest` is the
  // breaker (the Capacitor pair had to invent a timer precisely because Capgo
  // exposes no cancel — nfc-lock.ts:26,87-89).
  it("cancels and rejects with timeout once NFC_SESSION_TIMEOUT_MS elapses", async () => {
    jest.useFakeTimers();
    try {
      native.requestTechnology.mockImplementation(() => new Promise<void>(() => {}));

      const pending = lockEquipmentStickerTag();
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await jest.advanceTimersByTimeAsync(NFC_SESSION_TIMEOUT_MS);
      await assertion;

      expect(native.cancelTechnologyRequest).toHaveBeenCalled();
      expect(native.ndefHandler.getNdefStatus).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("cancelNfcProvisioning", () => {
  /**
   * The real contract on BOTH platforms: cancelling makes the PENDING
   * `requestTechnology` reject — Android invokes the stored callback with
   * ERR_CANCEL (NfcManager.java:113-127), iOS invalidates the tag session and
   * `tagReaderSession:didInvalidateWithError:` fires `techRequestCallback` with
   * the error (NfcManager.m:218-224). Modelled here so the test exercises the
   * mechanism the fix actually depends on rather than a convenient fiction.
   */
  function stageCancellableSession() {
    let rejectRequest: (reason: Error) => void = () => {};
    native.requestTechnology.mockImplementation(
      () => new Promise<void>((_resolve, reject) => (rejectRequest = reject)),
    );
    native.cancelTechnologyRequest.mockImplementation(async () => {
      rejectRequest(new Error("cancelled"));
    });
  }

  it("breaks a session that is still waiting for a tag", async () => {
    stageCancellableSession();

    const pending = lockEquipmentStickerTag();
    const assertion = expect(pending).rejects.toMatchObject({ code: "session_failed" });
    await cancelNfcProvisioning();

    await assertion;
    expect(native.ndefHandler.makeReadOnly).not.toHaveBeenCalled();
  });

  it("releases the single-flight guard so the NEXT action is not stuck on busy", async () => {
    // The tablet swaps the detail pane mid-session (EquipmentListScreen keys the
    // pane on the selected id, forcing a remount). Without this release, the
    // operator's next provisioning action on the newly-selected unit rejects
    // `busy` for the remainder of NFC_SESSION_TIMEOUT_MS.
    stageCancellableSession();
    const abandoned = lockEquipmentStickerTag();
    const abandonedAssertion = expect(abandoned).rejects.toThrow();
    await cancelNfcProvisioning();
    await abandonedAssertion;

    resetNative();
    stageStatuses(NdefStatus.ReadOnly);
    await expect(lockEquipmentStickerTag()).resolves.toEqual({ alreadyLocked: true });
  });

  it("is safe to call when nothing is in flight", async () => {
    await expect(cancelNfcProvisioning()).resolves.toBeUndefined();
  });
});

describe("NfcProvisionError", () => {
  it("carries a stable code the UI maps to translated copy", () => {
    const error = new NfcProvisionError("lock_failed");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("lock_failed");
  });
});
