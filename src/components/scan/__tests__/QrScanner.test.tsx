/**
 * Locks three QrScanner contracts:
 *
 * 1. Mount failure (CodeRabbit PR #58): when CameraView reports `onMountError`,
 *    the scanner must replace the (black) preview with the localized
 *    `scan.cameraUnavailable` state instead of leaving a dead frame.
 * 2. Lifecycle gate (W3B/F3): the camera session is held only while the screen
 *    is focused AND the app is foregrounded. Navigation focus alone is not
 *    enough — backgrounding a focused Scan screen never changes focus, so the
 *    camera would keep its session and can hang on resume.
 * 3. Torch (W3B/F3, Capacitor parity with `applyConstraints({advanced:[{torch}]})`):
 *    off on mount, toggled by an explicit control, and the operator's choice
 *    survives the background→foreground remount (a dark ward is still dark on
 *    resume).
 *
 * AppState is auto-mocked by the jest-expo preset (`AppState.currentState` is a
 * mock constructor, not "active"), so every test drives it the way
 * OfflineQueueBridge.test.tsx does: assign `currentState` and capture the
 * listener registered by the REAL `useAppActive` hook — the hook is deliberately
 * NOT mocked, so these tests exercise it end to end.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import QrScanner from "../QrScanner";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let cameraProps: Record<string, unknown> | null = null;

jest.mock("expo-camera", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    CameraView: (props: Record<string, unknown>) => {
      cameraProps = props;
      return <View testID="camera-view" />;
    },
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true },
      jest.fn(),
    ],
  };
});

let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  cameraProps = null;
  appStateListener = null;
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _event: string,
    handler: (state: AppStateStatus) => void,
  ) => {
    appStateListener = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** RNTL 14 runs an async act environment — a press must be flushed inside it. */
async function pressTorch() {
  await act(async () => {
    fireEvent.press(screen.getByTestId("torch-toggle"));
  });
}

/** Drive the captured AppState listener the way the OS would. */
async function emitAppState(state: AppStateStatus) {
  expect(appStateListener).toBeInstanceOf(Function);
  await act(async () => {
    appStateListener?.(state);
  });
}

describe("QrScanner active gate", () => {
  it("does not render CameraView while inactive (Android has no `active` prop — unmount is the only real stop)", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active={false} />);

    expect(screen.queryByTestId("camera-view")).toBeNull();
  });

  it("remounts CameraView when focus returns after ScanConfirm", async () => {
    const { rerender } = await render(
      <QrScanner onScanned={jest.fn()} hint="hint" active />,
    );
    expect(screen.getByTestId("camera-view")).toBeTruthy();

    await rerender(<QrScanner onScanned={jest.fn()} hint="hint" active={false} />);
    expect(screen.queryByTestId("camera-view")).toBeNull();

    await rerender(<QrScanner onScanned={jest.fn()} hint="hint" active />);
    expect(screen.getByTestId("camera-view")).toBeTruthy();
  });
});

describe("QrScanner app-lifecycle gate", () => {
  it("releases the camera when the app backgrounds even though navigation focus never changed", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);
    expect(screen.getByTestId("camera-view")).toBeTruthy();

    await emitAppState("background");

    expect(screen.queryByTestId("camera-view")).toBeNull();
  });

  it("reacquires the camera on foreground (listener is driven, not merely registered)", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);

    await emitAppState("background");
    expect(screen.queryByTestId("camera-view")).toBeNull();

    await emitAppState("active");
    expect(screen.getByTestId("camera-view")).toBeTruthy();
  });

  it("stays dark on foreground while the screen is unfocused (both halves of the gate are required)", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active={false} />);

    await emitAppState("background");
    await emitAppState("active");

    expect(screen.queryByTestId("camera-view")).toBeNull();
  });
});

describe("QrScanner torch", () => {
  it("starts with the torch off", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);

    expect(cameraProps?.enableTorch).toBe(false);
  });

  it("toggles the torch on and back off", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);

    await pressTorch();
    expect(cameraProps?.enableTorch).toBe(true);
    expect(screen.getByTestId("torch-toggle").props.accessibilityState).toMatchObject({
      selected: true,
    });

    await pressTorch();
    expect(cameraProps?.enableTorch).toBe(false);
    expect(screen.getByTestId("torch-toggle").props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it("keeps the torch on across a background→foreground remount", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);
    await pressTorch();
    expect(cameraProps?.enableTorch).toBe(true);

    await emitAppState("background");
    await emitAppState("active");

    expect(screen.getByTestId("camera-view")).toBeTruthy();
    expect(cameraProps?.enableTorch).toBe(true);
  });

  it("hides the torch control while no camera session is held", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);
    expect(screen.getByTestId("torch-toggle")).toBeTruthy();

    await emitAppState("background");

    expect(screen.queryByTestId("torch-toggle")).toBeNull();
  });
});

describe("QrScanner mount failure", () => {
  it("renders the localized unavailable state when the camera fails to mount", async () => {
    await render(<QrScanner onScanned={jest.fn()} hint="hint" active />);

    expect(screen.getByTestId("camera-view")).toBeTruthy();
    expect(typeof cameraProps?.onMountError).toBe("function");

    await act(async () => {
      (cameraProps?.onMountError as (e: { message: string }) => void)({
        message: "camera boom",
      });
    });

    expect(screen.queryByTestId("camera-view")).toBeNull();
    expect(screen.getByText("scan.cameraUnavailable")).toBeTruthy();
  });
});
