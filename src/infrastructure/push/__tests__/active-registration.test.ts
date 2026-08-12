/**
 * active-registration — the pre-sign-out deregister seam (CodeRabbit PR #53, Major).
 *
 * The "cleared" auth event fires AFTER the Clerk bearer is torn down, so a
 * deregister driven by it cannot authenticate. This module lets the sign-out UI
 * deregister BEFORE clearing the credential, and makes the operation take-once so
 * the late "cleared" fallback never double-fires the DELETE.
 */
import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";

import {
  clearActivePushRegistration,
  deregisterActivePushRegistration,
  setActivePushRegistration,
} from "../active-registration";

const TOKEN: PushDeviceToken = { platform: "ios", token: "tok-1" };

function makePort(overrides: Partial<PushPort> = {}): { port: PushPort; deregistered: PushDeviceToken[] } {
  const deregistered: PushDeviceToken[] = [];
  const port: PushPort = {
    requestPermission: async () => true,
    getDeviceToken: async () => null,
    register: async () => {},
    deregister: async (token) => {
      deregistered.push(token);
    },
    ensureEmergencyChannel: async () => {},
    installForegroundHandler: () => {},
    addResponseListener: () => () => {},
    addTokenListener: () => () => {},
    getInitialResponseData: async () => undefined,
    ...overrides,
  };
  return { port, deregistered };
}

afterEach(() => {
  clearActivePushRegistration();
});

describe("active push registration", () => {
  it("is a no-op when nothing is registered", async () => {
    await expect(deregisterActivePushRegistration()).resolves.toBeUndefined();
  });

  it("deregisters the active token exactly once (take-once)", async () => {
    const { port, deregistered } = makePort();
    setActivePushRegistration(port, TOKEN);

    await deregisterActivePushRegistration();
    await deregisterActivePushRegistration(); // late "cleared" fallback — must not double-fire

    expect(deregistered).toEqual([TOKEN]);
  });

  it("swallows a failing DELETE (best-effort, never blocks sign-out)", async () => {
    const { port } = makePort({
      deregister: async () => {
        throw new Error("401 AUTH_INVALID");
      },
    });
    setActivePushRegistration(port, TOKEN);

    await expect(deregisterActivePushRegistration()).resolves.toBeUndefined();
  });

  it("does not deregister after an explicit clear", async () => {
    const { port, deregistered } = makePort();
    setActivePushRegistration(port, TOKEN);
    clearActivePushRegistration();

    await deregisterActivePushRegistration();

    expect(deregistered).toEqual([]);
  });

  it("tracks the LATEST registration (token rotation replaces the old one)", async () => {
    const { port, deregistered } = makePort();
    const rotated: PushDeviceToken = { platform: "ios", token: "tok-2" };
    setActivePushRegistration(port, TOKEN);
    setActivePushRegistration(port, rotated);

    await deregisterActivePushRegistration();

    expect(deregistered).toEqual([rotated]);
  });
});
