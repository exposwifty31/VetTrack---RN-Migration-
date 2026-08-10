/**
 * G4-6 — OfflineQueueBridge: replay fires on AppState foreground and on
 * auth-identity signals, mirroring RealtimeBridge. No polling: the effect
 * must never call replay on a timer, only on the listed transitions.
 *
 * CodeRabbit PR #51 additions: the AppState listener is actually invoked
 * (not just registered) to prove it drives replay, `getCurrentUserId` is
 * threaded through (the cross-user security fix's other half), and a
 * rejecting replay never escapes as an unhandled rejection.
 */
import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import type { AuthChange } from "@/lib/auth-fetch";

import {
  _clearLastOfflineQueueReplayRejectionForTests,
  getLastOfflineQueueReplayRejection,
  OfflineQueueBridge,
} from "../OfflineQueueBridge";

async function mountActiveBridge(replayImpl?: jest.Mock) {
  const replay = replayImpl ?? jest.fn().mockResolvedValue(undefined);
  const resolveToken = jest.fn().mockResolvedValue("a.b.c");
  const getCurrentUserId = jest.fn().mockReturnValue("user_1");
  const originalState = AppState.currentState;
  AppState.currentState = "active";
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _event: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    appStateListener = listener;
    return { remove: () => {} };
  }) as typeof AppState.addEventListener);

  let authChangeListener: ((change: AuthChange) => void) | null = null;
  const onAuthChange = (listener: (change: AuthChange) => void) => {
    authChangeListener = listener;
    return () => {
      authChangeListener = null;
    };
  };

  const view = await render(
    <OfflineQueueBridge
      replay={replay}
      resolveToken={resolveToken}
      getCurrentUserId={getCurrentUserId}
      onAuthChange={onAuthChange}
    />,
  );

  return {
    replay,
    resolveToken,
    getCurrentUserId,
    getListener: () => appStateListener,
    fireAuthChange: async (change: AuthChange) => {
      await act(async () => {
        authChangeListener?.(change);
      });
    },
    fireAppStateChange: async (state: AppStateStatus) => {
      await act(async () => {
        appStateListener?.(state);
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
  it("replays once on mount while the app is already active, threading resolveToken AND getCurrentUserId", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(bridge.replay).toHaveBeenCalledTimes(1);
      expect(bridge.replay).toHaveBeenCalledWith({
        resolveToken: bridge.resolveToken,
        getCurrentUserId: bridge.getCurrentUserId,
      });
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

  it("invoking the registered AppState listener with 'active' actually calls replay (CodeRabbit PR #51)", async () => {
    const bridge = await mountActiveBridge();
    try {
      const callsAtMount = bridge.replay.mock.calls.length;
      expect(bridge.getListener()).not.toBeNull();

      await bridge.fireAppStateChange("active");

      expect(bridge.replay.mock.calls.length).toBe(callsAtMount + 1);
    } finally {
      await bridge.cleanup();
    }
  });

  it("invoking the AppState listener with a background state does NOT trigger replay", async () => {
    const bridge = await mountActiveBridge();
    try {
      const callsAtMount = bridge.replay.mock.calls.length;

      await bridge.fireAppStateChange("background");

      expect(bridge.replay.mock.calls.length).toBe(callsAtMount);
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

  describe("replay rejection handling (CodeRabbit PR #51)", () => {
    beforeEach(() => {
      _clearLastOfflineQueueReplayRejectionForTests();
    });

    it("a rejecting replay() never escapes as an unhandled rejection at the lifecycle boundary", async () => {
      const rejecting = jest.fn().mockRejectedValue(new Error("resolveToken exploded"));
      const bridge = await mountActiveBridge(rejecting);
      try {
        // Mount itself triggered a rejecting replay — let the microtask settle.
        await act(async () => {
          await Promise.resolve();
        });
        // No throw reaching here IS the assertion: render/mount survived.
        expect(rejecting).toHaveBeenCalled();
      } finally {
        await bridge.cleanup();
      }
    });

    it("reports the rejection so it is observable (not silently swallowed)", async () => {
      const rejecting = jest.fn().mockRejectedValue(new Error("resolveToken exploded"));
      const bridge = await mountActiveBridge(rejecting);
      try {
        await act(async () => {
          await Promise.resolve();
        });

        const reported = getLastOfflineQueueReplayRejection();
        expect(reported).not.toBeNull();
        expect(reported?.message).toBe("resolveToken exploded");
      } finally {
        await bridge.cleanup();
      }
    });
  });
});
