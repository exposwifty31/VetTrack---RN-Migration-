import { AppState } from "react-native";
import { act, create } from "react-test-renderer";

import type { RealtimePort } from "@/core/ports/realtime.port";

import { RealtimeBridge } from "../RealtimeBridge";

function makeFakePort() {
  let openCalls = 0;
  let closeCalls = 0;
  const port: RealtimePort = {
    open: () => {
      openCalls += 1;
    },
    close: () => {
      closeCalls += 1;
    },
    getCursor: () => 0,
    getState: () => "idle",
    subscribe: () => () => {},
  };
  return {
    port,
    get openCalls() {
      return openCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
  };
}

describe("RealtimeBridge", () => {
  it("re-opens on auth-ready while active, with no background transition", () => {
    const fake = makeFakePort();
    let authReadyListener: (() => void) | null = null;
    const onAuthReady = (listener: () => void) => {
      authReadyListener = listener;
      return () => {
        authReadyListener = null;
      };
    };

    // Simulate the signed-in cold-start: app is active, so mount opens once (which,
    // in production, resolves an invalid token and fails — modelled here as one open call).
    const originalState = AppState.currentState;
    AppState.currentState = "active";
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: () => {} } as ReturnType<typeof AppState.addEventListener>);

    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<RealtimeBridge port={fake.port} onAuthReady={onAuthReady} />);
    });
    expect(fake.openCalls).toBe(1); // mount open()
    expect(authReadyListener).not.toBeNull();

    // Sign-in installs the Clerk getter → auth-ready fires while still active.
    act(() => {
      authReadyListener?.();
    });
    expect(fake.openCalls).toBe(2); // re-opened without any AppState change

    act(() => {
      tree?.unmount();
    });
    AppState.currentState = originalState;
    jest.restoreAllMocks();
  });
});
