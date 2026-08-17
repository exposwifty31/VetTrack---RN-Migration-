/**
 * B7 — a denied notification permission must be OBSERVABLE, not swallowed.
 *
 * PushBridge's registration effect ended a denial with a bare `return`. That is
 * correct as control flow and wrong as product behaviour: Code Blue is delivered
 * over this channel, so one "Don't Allow" turns emergency alerting off for good
 * with nothing anywhere able to say so. `QrScanner` already models the right
 * shape for camera — show the state, offer the OS settings route — and it can
 * only do that because the denial is readable.
 *
 * These pin the readable part. The rendered surface lives in SettingsScreen.
 */
import { act, render } from "@testing-library/react-native";

import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";

import { clearActivePushRegistration } from "../active-registration";
import { PushBridge } from "../PushBridge";
import {
  _resetPushPermissionStatusForTests,
  getPushPermissionStatus,
} from "../push-permission-status";

jest.mock("../defaultPush", () => ({
  getDefaultPushPort: () => {
    throw new Error("PushBridge tests must inject a port");
  },
}));
jest.mock("@/app/useIdentity", () => ({
  useIdentity: () => ({ isSuccess: true, data: { id: "user-1" } }),
}));
jest.mock("@/lib/auth-store", () => ({ getCurrentUserId: () => "user-1" }));
jest.mock("@/navigation/navigationRef", () => ({
  navigateToEmergency: jest.fn(),
  navigateToMain: jest.fn(),
}));

const TOKEN: PushDeviceToken = { platform: "ios", token: "tok-initial" };

function makePort(overrides: Partial<PushPort> = {}): PushPort {
  return {
    requestPermission: async () => true,
    getDeviceToken: async () => TOKEN,
    register: async () => {},
    deregister: async () => {},
    ensureEmergencyChannel: async () => {},
    installForegroundHandler: () => {},
    addResponseListener: () => () => {},
    addTokenListener: () => () => {},
    getInitialResponseData: async () => undefined,
    ...overrides,
  };
}

const noAuthChange = () => () => {};

afterEach(() => {
  clearActivePushRegistration();
  _resetPushPermissionStatusForTests();
});

describe("push permission status", () => {
  it("starts unknown — before any prompt nothing may claim push is off", async () => {
    expect(getPushPermissionStatus()).toBe("unknown");
  });

  it("records a DENIED permission instead of returning silently", async () => {
    const port = makePort({ requestPermission: async () => false });
    const view = await render(<PushBridge port={port} onAuthChange={noAuthChange} />);
    await act(async () => {});

    expect(getPushPermissionStatus()).toBe("denied");

    await view.unmount();
  });

  it("records a GRANTED permission", async () => {
    const view = await render(<PushBridge port={makePort()} onAuthChange={noAuthChange} />);
    await act(async () => {});

    expect(getPushPermissionStatus()).toBe("granted");

    await view.unmount();
  });

  it("does not record anything when the effect was cancelled before the prompt resolved", async () => {
    // Mirrors the existing cancellation contract: an unmount mid-flight must not
    // leave a "denied" behind that the Settings screen would then show forever.
    let resolvePermission!: (granted: boolean) => void;
    const gate = new Promise<boolean>((r) => {
      resolvePermission = r;
    });
    const port = makePort({ requestPermission: () => gate });
    const view = await render(<PushBridge port={port} onAuthChange={noAuthChange} />);

    await view.unmount();
    await act(async () => {
      resolvePermission(false);
    });

    expect(getPushPermissionStatus()).toBe("unknown");
  });
});
