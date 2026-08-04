import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { RealtimePort } from "@/core/ports/realtime.port";
import type { AuthChange } from "@/lib/auth-fetch";

import { RealtimeBridge } from "../RealtimeBridge";

/**
 * Records the ORDER of open/close, not just counts. Counters cannot distinguish
 * "close then open" from "open then close" — and the whole point of the auth-change
 * lifecycle is that SseAdapter.open() no-ops on an already-open stream, so an
 * account switch MUST close before it reopens to swap the Bearer token.
 */
function makeFakePort() {
  const calls: Array<"open" | "close"> = [];
  const port: RealtimePort = {
    open: () => {
      calls.push("open");
    },
    close: () => {
      calls.push("close");
    },
    getCursor: () => 0,
    getState: () => "idle",
    subscribe: () => () => {},
  };
  return { port, calls };
}

/**
 * Mounts RealtimeBridge with AppState forced `active` (so open/close fire without a
 * real foreground transition) and a captured auth-change subscriber the test drives.
 */
async function mountActiveBridge() {
  const { port, calls } = makeFakePort();
  const originalState = AppState.currentState;
  AppState.currentState = "active";
  jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove: () => {} } as ReturnType<typeof AppState.addEventListener>);

  let authChangeListener: ((change: AuthChange) => void) | null = null;
  const onAuthChange = (listener: (change: AuthChange) => void) => {
    authChangeListener = listener;
    return () => {
      authChangeListener = null;
    };
  };

  const view = await render(<RealtimeBridge port={port} onAuthChange={onAuthChange} />);

  return {
    calls,
    getListener: () => authChangeListener,
    fire: async (change: AuthChange) => {
      await act(async () => {
        authChangeListener?.(change);
      });
    },
    cleanup: async () => {
      await view.unmount();
      AppState.currentState = originalState;
      jest.restoreAllMocks();
    },
  };
}

describe("RealtimeBridge", () => {
  it("re-opens on auth 'ready' (sign-in) while active, with no background transition", async () => {
    const bridge = await mountActiveBridge();
    try {
      // Signed-in cold start: app is active, so mount opens once (in production this
      // resolves an invalid token and fails — modelled here as one open call).
      expect(bridge.calls).toEqual(["open"]);
      expect(bridge.getListener()).not.toBeNull();

      // Sign-in installs the Clerk getter → "ready" fires while still active.
      await bridge.fire("ready");
      expect(bridge.calls).toEqual(["open", "open"]); // re-opened without any AppState change
    } finally {
      await bridge.cleanup();
    }
  });

  it("closes the stream on auth 'cleared' (sign-out) and does NOT reopen", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(bridge.calls).toEqual(["open"]); // mount open()

      const before = bridge.calls.length;
      await bridge.fire("cleared");

      // Sign-out must close and stay closed — never keep streaming with the stale token.
      const after = bridge.calls.slice(before);
      expect(after).toEqual(["close"]);
      expect(after).not.toContain("open");
    } finally {
      await bridge.cleanup();
    }
  });

  it("closes then reopens on auth 'changed' (account switch) so the new token is used", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(bridge.calls).toEqual(["open"]); // mount open()

      const before = bridge.calls.length;
      await bridge.fire("changed");

      // Order matters: open() no-ops on an open stream, so close MUST precede open.
      expect(bridge.calls.slice(before)).toEqual(["close", "open"]);
    } finally {
      await bridge.cleanup();
    }
  });
});
