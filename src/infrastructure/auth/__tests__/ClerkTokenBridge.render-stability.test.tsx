/**
 * Regression pin for the SSE reconnect loop seen on iPad against production
 * (2026-08-21): the app reopened `/api/realtime/stream` roughly twice a second,
 * forever, with the server never ending a single one of those connections.
 *
 * ClerkTokenBridge's effect depends on `getToken`, and `@clerk/expo` v4's
 * `useAuth` returns a NEW `getToken` identity on every render — it wraps
 * `@clerk/react`'s useCallback-memoised getToken in a bare arrow function with
 * no useCallback of its own (`node_modules/@clerk/expo/dist/hooks/useAuth.js`):
 *
 *     const getToken = (opts) => getTokenBase(opts).then(...)
 *
 * So every render re-ran the effect: cleanup fired `setClerkTokenGetter(null)`
 * ("cleared") and the body fired `setClerkTokenGetter(fn)` ("ready"), and
 * RealtimeBridge answers that pair with `port.close()` + `port.open()` — a full
 * SSE teardown and rebuild per render.
 *
 * The sibling suite could not catch this: it mocks `useAuth` with one
 * module-scope object whose `getToken` is a stable `jest.fn`, which is MORE
 * stable than the real library. The mock here reproduces the real hook's
 * per-render identity churn, which is the only way a unit test sees the bug.
 */
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { RealtimePort } from "@/core/ports/realtime.port";
import { RealtimeBridge } from "@/infrastructure/realtime/RealtimeBridge";
import {
  type AuthChange,
  getClerkTokenGetter,
  setClerkTokenGetter,
  subscribeAuthChange,
} from "@/lib/auth-fetch";

import { setSessionSignOut } from "../authSession";
import { ClerkTokenBridge } from "../ClerkTokenBridge";

/** Mutable identity the mocked hook reports; a test flips these between renders. */
const mockSession = {
  isSignedIn: true,
  userId: "user_1" as string | null,
  token: "header.payload.sig",
  /** How many distinct `getToken` closures the hook has handed out. */
  getTokenIdentities: 0,
};

const mockSignOut = jest.fn(async () => {});

/**
 * Faithful stand-in for `@clerk/expo` v4's `useAuth`: `signOut` is stable (it is
 * `useCallback`-memoised upstream and the expo wrapper passes it through
 * untouched via `...rest`), while `getToken` is a fresh closure every render.
 */
jest.mock("@clerk/expo", () => ({
  useAuth: () => {
    mockSession.getTokenIdentities += 1;
    return {
      isSignedIn: mockSession.isSignedIn,
      userId: mockSession.userId,
      getToken: async (): Promise<string | null> => mockSession.token,
      signOut: mockSignOut,
    };
  },
}));

function makeFakePort() {
  const calls: ("open" | "close")[] = [];
  const port: RealtimePort = {
    open: () => void calls.push("open"),
    close: () => void calls.push("close"),
    getCursor: () => 0,
    getState: () => "idle",
    subscribe: () => () => {},
  };
  return { port, calls };
}

let originalAppState: (typeof AppState)["currentState"];

beforeEach(() => {
  originalAppState = AppState.currentState;
  AppState.currentState = "active";
  jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove: () => {} } as ReturnType<typeof AppState.addEventListener>);
  mockSession.isSignedIn = true;
  mockSession.userId = "user_1";
  mockSession.token = "header.payload.sig";
  mockSession.getTokenIdentities = 0;
});

afterEach(() => {
  setClerkTokenGetter(null);
  setSessionSignOut(null);
  AppState.currentState = originalAppState;
  jest.restoreAllMocks();
});

describe("ClerkTokenBridge render stability", () => {
  it("emits no auth transition when only the getToken identity churns across renders", async () => {
    const changes: AuthChange[] = [];
    const view = await render(<ClerkTokenBridge />);
    // The mount install is a real transition; only what follows it is the defect.
    const unsubscribe = subscribeAuthChange((change) => changes.push(change));

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await view.rerender(<ClerkTokenBridge />);
      });
    }
    unsubscribe();

    // Every render handed out a distinct getToken — the condition that triggers it.
    expect(mockSession.getTokenIdentities).toBeGreaterThan(5);
    expect(changes).toEqual([]);
  });

  it("does not rebuild the SSE transport when a re-render changes nothing but getToken", async () => {
    const { port, calls } = makeFakePort();
    const view = await render(
      <>
        <RealtimeBridge port={port} />
        <ClerkTokenBridge />
      </>,
    );
    calls.length = 0; // ignore the mount-time open

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await view.rerender(
          <>
            <RealtimeBridge port={port} />
            <ClerkTokenBridge />
          </>,
        );
      });
    }

    expect(calls).toEqual([]);
  });

  it("still re-signals on a genuine account switch", async () => {
    const changes: AuthChange[] = [];
    const view = await render(<ClerkTokenBridge />);
    const unsubscribe = subscribeAuthChange((change) => changes.push(change));

    mockSession.userId = "user_2";
    mockSession.token = "second.account.sig";
    await act(async () => {
      await view.rerender(<ClerkTokenBridge />);
    });
    unsubscribe();

    expect(changes).toEqual(["cleared", "ready"]);
  });

  it("keeps the installed getter pointed at the latest getToken (no stale closure)", async () => {
    const view = await render(<ClerkTokenBridge />);

    mockSession.token = "rotated.by.clerk";
    await act(async () => {
      await view.rerender(<ClerkTokenBridge />);
    });

    await expect(getClerkTokenGetter()?.()).resolves.toBe("rotated.by.clerk");
  });
});
