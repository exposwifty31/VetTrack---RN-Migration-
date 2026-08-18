/**
 * `useNfcSupported` — the hardware gate for the provisioning card.
 *
 * Separate from `useNfcAdvisoryScan` on purpose: that hook owns a READER
 * session, and its cleanup calls `cancelTechnologyRequest()`. Mounting it on the
 * equipment-detail screen purely to read `supported` would put a second reader
 * lifecycle next to a write/lock session that must own its own.
 */
import { renderHook, waitFor } from "@testing-library/react-native";
import NfcManager from "react-native-nfc-manager";

import { useNfcSupported } from "../useNfcSupported";

const native = NfcManager as unknown as { isSupported: jest.Mock; start: jest.Mock };

beforeEach(() => {
  native.isSupported.mockReset().mockResolvedValue(false);
  native.start.mockReset().mockResolvedValue(undefined);
});

describe("useNfcSupported", () => {
  it("stays null while the probe is still in flight — 'undetermined' is not 'unsupported'", async () => {
    // A probe that has not answered must not read as `false`, or the card would
    // briefly claim the device has no NFC on every mount.
    native.isSupported.mockImplementation(() => new Promise<boolean>(() => {}));

    const { result } = await renderHook(() => useNfcSupported());

    expect(result.current).toBeNull();
  });

  it("reports true and starts the NFC manager when hardware is present", async () => {
    native.isSupported.mockResolvedValue(true);

    const { result } = await renderHook(() => useNfcSupported());

    await waitFor(() => expect(result.current).toBe(true));
    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it("reports false and does NOT start the manager when hardware is absent", async () => {
    native.isSupported.mockResolvedValue(false);

    const { result } = await renderHook(() => useNfcSupported());

    await waitFor(() => expect(result.current).toBe(false));
    expect(native.start).not.toHaveBeenCalled();
  });

  it("treats a throwing probe as unsupported rather than leaving the gate open", async () => {
    native.isSupported.mockRejectedValue(new Error("no nfc service"));

    const { result } = await renderHook(() => useNfcSupported());

    await waitFor(() => expect(result.current).toBe(false));
  });
});
