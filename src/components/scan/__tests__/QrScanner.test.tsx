/**
 * Locks the camera mount-failure contract (CodeRabbit PR #58): when CameraView
 * reports `onMountError`, the scanner must replace the (black) preview with the
 * localized `scan.cameraUnavailable` state instead of leaving a dead frame.
 */
import { act, render, screen } from "@testing-library/react-native";

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

describe("QrScanner active gate", () => {
  beforeEach(() => {
    cameraProps = null;
  });

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

describe("QrScanner mount failure", () => {
  beforeEach(() => {
    cameraProps = null;
  });

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
