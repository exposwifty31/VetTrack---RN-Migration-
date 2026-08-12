/**
 * ExpoPushAdapter — the two CodeRabbit PR #53 adapter contracts:
 *  1. getDeviceToken() honors the port contract on its own — null when permission
 *     is not granted, without asking the OS for a token (direct PushPort callers
 *     get the guarantee, not only the bridge's happy path);
 *  2. addTokenListener() maps a rotated native token through the same
 *     platform/emptiness gates as getDeviceToken (junk never reaches the server).
 */
import type { PushDeviceToken } from "@/core/ports/push.port";

import { ExpoPushAdapter } from "../ExpoPushAdapter";

jest.mock("expo-device", () => ({ isDevice: true }));

const mockGetPermissionsAsync = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();
const mockAddPushTokenListener = jest.fn();
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  getDevicePushTokenAsync: (...args: unknown[]) => mockGetDevicePushTokenAsync(...args),
  addPushTokenListener: (...args: unknown[]) => mockAddPushTokenListener(...args),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

jest.mock("@/i18n", () => ({ i18n: { t: (key: string) => key } }));
jest.mock("@/lib/api", () => ({ api: { push: { subscribe: jest.fn(), unsubscribe: jest.fn() } } }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ExpoPushAdapter.getDeviceToken", () => {
  it("returns null WITHOUT fetching a native token when permission is not granted", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });

    const token = await new ExpoPushAdapter().getDeviceToken();

    expect(token).toBeNull();
    expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it("returns the platform-tagged native token when permission is granted", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockGetDevicePushTokenAsync.mockResolvedValue({ type: "ios", data: "apns-tok" });

    const token = await new ExpoPushAdapter().getDeviceToken();

    expect(token).toEqual({ platform: "ios", token: "apns-tok" });
  });
});

describe("ExpoPushAdapter.addTokenListener", () => {
  function installListener() {
    const remove = jest.fn();
    mockAddPushTokenListener.mockReturnValue({ remove });
    const seen: PushDeviceToken[] = [];
    const unsubscribe = new ExpoPushAdapter().addTokenListener((token) => seen.push(token));
    const fire = mockAddPushTokenListener.mock.calls[0][0] as (t: { type: string; data: unknown }) => void;
    return { seen, unsubscribe, remove, fire };
  }

  it("delivers a rotated native token through the platform gate", () => {
    const { seen, fire } = installListener();

    fire({ type: "android", data: "fcm-rotated" });

    expect(seen).toEqual([{ platform: "android", token: "fcm-rotated" }]);
  });

  it("drops non-mobile platforms and empty tokens", () => {
    const { seen, fire } = installListener();

    fire({ type: "web", data: "junk" });
    fire({ type: "ios", data: "   " });

    expect(seen).toEqual([]);
  });

  it("returns an unsubscribe that removes the native subscription", () => {
    const { unsubscribe, remove } = installListener();

    unsubscribe();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
