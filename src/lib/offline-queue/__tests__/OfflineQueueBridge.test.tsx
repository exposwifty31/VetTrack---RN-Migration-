/**
 * G4-6 — OfflineQueueBridge: replay fires on AppState foreground and on
 * auth-identity signals, mirroring RealtimeBridge. No polling: the effect
 * must never call replay on a timer, only on the listed transitions.
 *
 * CodeRabbit PR #51 round 1: the AppState listener is actually invoked (not
 * just registered) to prove it drives replay, `getCurrentUserId` was
 * threaded through, and a rejecting replay never escapes as an unhandled
 * rejection.
 *
 * CodeRabbit PR #51 round 2 (CRITICAL): round 1's `resolveToken` +
 * `getCurrentUserId` were two INDEPENDENT dependencies — an account switch
 * between the two reads could pair one identity's token with a different
 * identity's queued write. The bridge now takes a single atomic
 * `resolveAuthSnapshot` dependency. The tests below update the mocked-`replay`
 * suite to the new shape AND add a full Bridge → real `replayOfflineQueue`
 * integration proving no item is ever dispatched with a token from a
 * different identity than its own owner.
 */
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import type { AuthChange } from "@/lib/auth-fetch";

import {
  _resetOfflineQueueForTests,
  enqueueOfflineWrite,
  getOfflineQueueSnapshot,
  replayOfflineQueue,
  type ReplayAuthSnapshot,
} from "../offline-queue";
import {
  _clearLastOfflineQueueReplayRejectionForTests,
  getLastOfflineQueueReplayRejection,
  OfflineQueueBridge,
} from "../OfflineQueueBridge";

const mockMemoryStore = new Map<string, string>();

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn((key: string) => mockMemoryStore.get(key) ?? null),
  safeStorageSetItem: jest.fn((key: string, value: string) => {
    mockMemoryStore.set(key, value);
    return true;
  }),
  safeStorageRemoveItem: jest.fn((key: string) => mockMemoryStore.delete(key)),
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

async function mountActiveBridge(replayImpl?: jest.Mock) {
  const replay = replayImpl ?? jest.fn().mockResolvedValue(undefined);
  const resolveAuthSnapshot = jest.fn().mockResolvedValue({ userId: "user_1", token: "a.b.c" });
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
    <OfflineQueueBridge replay={replay} resolveAuthSnapshot={resolveAuthSnapshot} onAuthChange={onAuthChange} />,
  );

  return {
    replay,
    resolveAuthSnapshot,
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
  it("replays once on mount while the app is already active, threading resolveAuthSnapshot", async () => {
    const bridge = await mountActiveBridge();
    try {
      expect(bridge.replay).toHaveBeenCalledTimes(1);
      expect(bridge.replay).toHaveBeenCalledWith({
        resolveAuthSnapshot: bridge.resolveAuthSnapshot,
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
      const rejecting = jest.fn().mockRejectedValue(new Error("resolveAuthSnapshot exploded"));
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
      const rejecting = jest.fn().mockRejectedValue(new Error("resolveAuthSnapshot exploded"));
      const bridge = await mountActiveBridge(rejecting);
      try {
        await act(async () => {
          await Promise.resolve();
        });

        const reported = getLastOfflineQueueReplayRejection();
        expect(reported).not.toBeNull();
        expect(reported?.message).toBe("resolveAuthSnapshot exploded");
      } finally {
        await bridge.cleanup();
      }
    });
  });

  describe("atomic auth snapshot — CodeRabbit PR #51 round 2 CRITICAL", () => {
    const realFetch = globalThis.fetch;
    const mockFetch = jest.fn();
    const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

    beforeAll(() => {
      process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    });

    afterAll(() => {
      if (prevOrigin === undefined) {
        delete process.env.EXPO_PUBLIC_API_ORIGIN;
      } else {
        process.env.EXPO_PUBLIC_API_ORIGIN = prevOrigin;
      }
    });

    beforeEach(() => {
      mockMemoryStore.clear();
      mockUuidCounter = 0;
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      globalThis.fetch = mockFetch as unknown as typeof fetch;
      _resetOfflineQueueForTests();
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it("CRITICAL: end-to-end through the REAL replayOfflineQueue — identity switching between items never sends a token from a different identity than the item's owner", async () => {
      // Two items, two different owners — queued exactly as authFetch would
      // (userId captured at enqueue time). Regression shape: round 1 wired a
      // pass-level resolveToken + a per-item getCurrentUserId as SEPARATE
      // dependencies; if this bridge still did that, an account switch
      // between items could pair user-a's leftover token with user-b's item
      // (or vice versa). resolveAuthSnapshot must be threaded through as ONE
      // atomic dependency, called fresh per item, all the way from the
      // bridge to the real queue's fetch dispatch.
      enqueueOfflineWrite({
        endpoint: "/api/equipment/eq-a/checkout",
        method: "POST",
        body: "{}",
        userId: "user-a",
      });
      enqueueOfflineWrite({
        endpoint: "/api/equipment/eq-b/checkout",
        method: "POST",
        body: "{}",
        userId: "user-b",
      });

      let call = 0;
      const resolveAuthSnapshot = jest.fn(async (): Promise<ReplayAuthSnapshot> => {
        call++;
        // Simulates the account switching BETWEEN items in the same pass —
        // user-a's token/identity resolves for the first snapshot request,
        // then the "account" moves to user-b before the second item is
        // dispatched.
        return call === 1
          ? { userId: "user-a", token: "token-for-user-a" }
          : { userId: "user-b", token: "token-for-user-b" };
      });

      const originalState = AppState.currentState;
      AppState.currentState = "active";
      const onAuthChange = () => () => {};

      const view = await render(
        <OfflineQueueBridge
          replay={replayOfflineQueue}
          resolveAuthSnapshot={resolveAuthSnapshot}
          onAuthChange={onAuthChange}
        />,
      );
      try {
        // CodeRabbit PR #51 round 3 nit: a fixed number of microtask flushes
        // does not GUARANTEE persistence has caught up with the fetch calls
        // before the queue assertion runs — wait on the actual state
        // (fetch call count, then queue removal) instead of a fixed count
        // of `Promise.resolve()` hops.
        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        const calls = mockFetch.mock.calls as [string, RequestInit][];
        const aCall = calls.find(([url]) => url.includes("eq-a"));
        const bCall = calls.find(([url]) => url.includes("eq-b"));
        expect(aCall).toBeDefined();
        expect(bCall).toBeDefined();

        const aHeaders = aCall?.[1].headers as Record<string, string>;
        const bHeaders = bCall?.[1].headers as Record<string, string>;
        // The gate: each item's request carries ONLY its own owner's token —
        // never the other identity's.
        expect(aHeaders.Authorization).toBe("Bearer token-for-user-a");
        expect(bHeaders.Authorization).toBe("Bearer token-for-user-b");

        await waitFor(() => {
          expect(getOfflineQueueSnapshot()).toHaveLength(0); // both synced under their own identity
        });
      } finally {
        await view.unmount();
        AppState.currentState = originalState;
      }
    });
  });
});
