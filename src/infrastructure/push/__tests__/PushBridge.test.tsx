/**
 * PushBridge — the CodeRabbit PR #53 lifecycle contracts:
 *  1. a rotated native token (APNs/FCM roll while the app runs) is re-registered
 *     for the active user, and becomes the deregister target;
 *  2. rotations are ORDER-SAFE: only the newest token ever commits — a rotation
 *     landing during the initial POST is deferred and then wins, and two in-flight
 *     rotations resolving out of order still leave the newest as the deregister
 *     target (PR #54 round-2 Major);
 *  3. a cancelled effect stops at the next await boundary — unmounting before the
 *     channel resolves must NOT prompt for permission (React dev effect replay /
 *     identity swap would otherwise surface an orphan OS dialog);
 *  4. unmount removes the native rotation listener.
 */
import { act, render } from "@testing-library/react-native";

import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";
import type { AuthChange } from "@/lib/auth-fetch";

import { clearActivePushRegistration } from "../active-registration";
import { PushBridge } from "../PushBridge";

// Every test injects a fake port; stub the default-port module so its transitive
// native/i18n imports never load in the jest environment.
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
const ROTATED: PushDeviceToken = { platform: "ios", token: "tok-rotated" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeHarness(overrides: Partial<PushPort> = {}) {
  const calls: string[] = [];
  const registered: PushDeviceToken[] = [];
  const deregistered: PushDeviceToken[] = [];
  const removeTokenListener = jest.fn();
  let tokenListener: ((token: PushDeviceToken) => void) | null = null;
  let authListener: ((change: AuthChange) => void) | null = null;
  const port: PushPort = {
    requestPermission: async () => {
      calls.push("requestPermission");
      return true;
    },
    getDeviceToken: async () => TOKEN,
    register: async (token) => {
      registered.push(token);
    },
    deregister: async (token) => {
      deregistered.push(token);
    },
    ensureEmergencyChannel: async () => {
      calls.push("ensureEmergencyChannel");
    },
    installForegroundHandler: () => {},
    addResponseListener: () => () => {},
    addTokenListener: (onToken) => {
      tokenListener = onToken;
      return removeTokenListener;
    },
    getInitialResponseData: async () => undefined,
    ...overrides,
  };
  const onAuthChange = (listener: (change: AuthChange) => void) => {
    authListener = listener;
    return () => {
      authListener = null;
    };
  };
  return {
    port,
    onAuthChange,
    calls,
    registered,
    deregistered,
    removeTokenListener,
    rotate: async (token: PushDeviceToken) => {
      await act(async () => {
        tokenListener?.(token);
      });
    },
    fireAuth: async (change: AuthChange) => {
      await act(async () => {
        authListener?.(change);
      });
    },
  };
}

afterEach(() => {
  clearActivePushRegistration();
});

describe("PushBridge token rotation", () => {
  it("re-registers a rotated token and makes it the deregister target", async () => {
    const h = makeHarness();
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {}); // settle channel → permission → token → register
    expect(h.registered).toEqual([TOKEN]);

    await h.rotate(ROTATED);
    expect(h.registered).toEqual([TOKEN, ROTATED]);

    await h.fireAuth("cleared");
    expect(h.deregistered).toEqual([ROTATED]); // the rotated token, not the stale one

    await view.unmount();
  });

  it("defers a rotation that lands during the initial POST — and the rotation wins", async () => {
    const gate = deferred<boolean>();
    const h = makeHarness({
      requestPermission: () => gate.promise, // initial flow parked BEFORE its register
    });
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});

    await h.rotate(ROTATED);
    expect(h.registered).toEqual([]); // permission still pending → nothing may POST yet

    await act(async () => {
      gate.resolve(true);
    });
    // The deferred rotation is registered after the initial token, and being the
    // NEWEST native token it is the one sign-out must deregister.
    expect(h.registered).toEqual([TOKEN, ROTATED]);
    await h.fireAuth("cleared");
    expect(h.deregistered).toEqual([ROTATED]);

    await view.unmount();
  });

  it("wins the TRUE initial-POST race: rotation during the in-flight initial register", async () => {
    const gates = new Map<string, { resolve: () => void }>();
    const h = makeHarness({
      register: (token) => {
        h.registered.push(token);
        let release!: () => void;
        const promise = new Promise<void>((r) => {
          release = r;
        });
        gates.set(token.token, { resolve: release });
        return promise; // EVERY register held — the initial POST is genuinely in flight
      },
    });
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});
    expect(h.registered).toEqual([TOKEN]); // initial POST started, unresolved

    await h.rotate(ROTATED); // rotation lands DURING the initial POST
    expect(h.registered).toEqual([TOKEN, ROTATED]);

    await act(async () => {
      gates.get(ROTATED.token)!.resolve(); // rotated resolves FIRST
    });
    await act(async () => {
      gates.get(TOKEN.token)!.resolve(); // initial resolves late — must not win
    });

    await h.fireAuth("cleared");
    // The late stale initial resolve is compensated with an immediate DELETE, and
    // sign-out deregisters the newest (rotated) token.
    expect(h.deregistered).toEqual([TOKEN, ROTATED]);

    await view.unmount();
  });

  it("compensates a register that completes after cleanup (no orphan subscription)", async () => {
    const gate = deferred<void>();
    const h = makeHarness({
      register: (token) => {
        h.registered.push(token);
        return gate.promise; // initial register still in flight at unmount
      },
    });
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});
    expect(h.registered).toEqual([TOKEN]);

    await view.unmount(); // cleanup while the POST is pending

    await act(async () => {
      gate.resolve(); // the durable server request completes anyway
    });

    // The completed-but-unwanted subscription is deleted best-effort instead of
    // being silently dropped from tracking.
    expect(h.deregistered).toEqual([TOKEN]);
  });

  it("keeps the newest rotation when two in-flight registers resolve out of order", async () => {
    const ROTATED_B: PushDeviceToken = { platform: "ios", token: "tok-rotated-b" };
    const gates = new Map<string, { promise: Promise<void>; resolve: () => void }>();
    const h = makeHarness({
      register: (token) => {
        h.registered.push(token);
        // Initial token registers instantly; each rotation gets its own gate so the
        // test controls completion order.
        if (token.token === TOKEN.token) return Promise.resolve();
        let release!: () => void;
        const promise = new Promise<void>((r) => {
          release = r;
        });
        gates.set(token.token, { promise, resolve: release });
        return promise;
      },
    });
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});
    expect(h.registered).toEqual([TOKEN]);

    await h.rotate(ROTATED_B); // older rotation…
    await h.rotate(ROTATED); // …then the newest — both registers now in flight

    await act(async () => {
      gates.get(ROTATED.token)!.resolve(); // NEWEST resolves first
    });
    await act(async () => {
      gates.get(ROTATED_B.token)!.resolve(); // stale one resolves late
    });

    await h.fireAuth("cleared");
    // The stale late resolve (B) is compensated with an immediate DELETE; sign-out
    // then deregisters the newest token (C) — never the other way around.
    expect(h.deregistered).toEqual([ROTATED_B, ROTATED]);

    await view.unmount();
  });

  it("does not repeat an identical rotated token", async () => {
    const h = makeHarness();
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});

    await h.rotate(TOKEN); // same token the flow just registered

    expect(h.registered).toEqual([TOKEN]);
    await view.unmount();
  });

  it("removes the native rotation listener on unmount", async () => {
    const h = makeHarness();
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});

    await view.unmount();

    expect(h.removeTokenListener).toHaveBeenCalledTimes(1);
  });
});

describe("PushBridge effect cancellation", () => {
  it("stops before requestPermission when unmounted mid-channel-creation", async () => {
    const channel = deferred<void>();
    const h = makeHarness({
      ensureEmergencyChannel: () => {
        h.calls.push("ensureEmergencyChannel");
        return channel.promise;
      },
    });
    const view = await render(<PushBridge port={h.port} onAuthChange={h.onAuthChange} />);
    await act(async () => {});

    await view.unmount(); // cancels the effect while ensureEmergencyChannel is in flight
    await act(async () => {
      channel.resolve();
    });

    expect(h.calls).toEqual(["ensureEmergencyChannel"]);
    expect(h.registered).toEqual([]);
  });
});
