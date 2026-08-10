/**
 * G4-6 — OfflineQueueBridge: replay fires on AppState foreground and on
 * auth-identity signals, mirroring RealtimeBridge. No polling: the effect
 * must never call replay on a timer, only on the listed transitions.
 */
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { AuthChange } from "@/lib/auth-fetch";

import { OfflineQueueBridge } from "../OfflineQueueBridge";

async function mountActiveBridge() {
  const replay = jest.fn().mockResolvedValue(undefined);
  const resolveToken = jest.fn().mockResolvedValue("a.b.c");
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

  const view = await render(
    <OfflineQueueBridge replay={replay} resolveToken={resolveToken} onAuthChange={onAuthChange} />,
  );

  return {
    replay,
    resolveToken,
    fireAuthChange: async (change: AuthChange) => {
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

describe("OfflineQueueBridge", () => {
  it("replays once on mount while the app is already active", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(bridge.replay).toHaveBeenCalledTimes(1);
      expect(bridge.replay).toHaveBeenCalledWith({ resolveToken: bridge.resolveToken });
    } finally {
      await bridge.cleanup();
    }
  });

  it("replays again on auth 'ready' (sign-in) while foregrounded", async () => {
    const bridge = await mountActiveBridge();
    try {
      await bridge.fireAuthChange("ready");
      expect(bridge.replay).toHaveBeenCalledTimes(2);
    } finally {
      await bridge.cleanup();
    }
  });

  it("does not replay on auth 'cleared' (sign-out)", async () => {
    const bridge = await mountActiveBridge();
    try {
      await bridge.fireAuthChange("cleared");
      expect(bridge.replay).toHaveBeenCalledTimes(1); // only the mount-time call
    } finally {
      await bridge.cleanup();
    }
  });

  it("registers an AppState 'change' listener (not a timer) to drive replay", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    } finally {
      await bridge.cleanup();
    }
  });

  it("never replays on a timer — advancing fake time alone triggers no further replay", async () => {
    jest.useFakeTimers();
    const bridge = await mountActiveBridge();
    try {
      const callsAtMount = bridge.replay.mock.calls.length;
      jest.advanceTimersByTime(5 * 60_000); // 5 minutes — long enough to catch any hidden interval
      expect(bridge.replay.mock.calls.length).toBe(callsAtMount);
    } finally {
      await bridge.cleanup();
      jest.useRealTimers();
    }
  });
});
