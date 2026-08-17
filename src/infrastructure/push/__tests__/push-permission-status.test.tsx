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
import { AppState } from "react-native";

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

describe("repairing a denial without a cold start", () => {
  it("re-checks permission when the app becomes active, and registers the token", async () => {
    // The gap B7's first version left. SettingsScreen sends the user to
    // Linking.openSettings() — which is the ONLY place a denial can be undone —
    // but returning does not restart PushBridge's identity effect. So the grant
    // landed, the card kept saying "denied", and no token was registered for the
    // rest of the session: the repair path led nowhere.
    let granted = false;
    const registered: PushDeviceToken[] = [];
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, cb: (s: string) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    const port = makePort({
      requestPermission: async () => granted,
      register: async (token) => {
        registered.push(token);
      },
    });
    const view = await render(<PushBridge port={port} onAuthChange={noAuthChange} />);
    await act(async () => {});

    expect(getPushPermissionStatus()).toBe("denied");
    expect(registered).toEqual([]);

    // The user grants in system settings and returns to the app.
    granted = true;
    await act(async () => {
      for (const cb of listeners) cb("active");
    });
    await act(async () => {});

    expect(getPushPermissionStatus()).toBe("granted");
    expect(registered).toEqual([TOKEN]);

    await view.unmount();
  });

  it("does not re-prompt on app-active when permission was already granted", async () => {
    // Only a DENIAL is repairable this way. Re-running the flow on every
    // foreground would be a prompt loop and a pointless re-register.
    const requestPermission = jest.fn(async () => true);
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, cb: (s: string) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    const view = await render(
      <PushBridge port={makePort({ requestPermission })} onAuthChange={noAuthChange} />,
    );
    await act(async () => {});
    const afterMount = requestPermission.mock.calls.length;

    await act(async () => {
      for (const cb of listeners) cb("active");
    });

    expect(requestPermission).toHaveBeenCalledTimes(afterMount);

    await view.unmount();
  });
});
