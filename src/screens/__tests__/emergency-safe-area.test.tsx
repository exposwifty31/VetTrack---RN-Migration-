/**
 * EmergencyScreen must respect the TOP safe-area inset: on notch/Dynamic-Island
 * devices the vet-only banner (first child of CodeBlueActions) painted OVER the
 * status-bar row on BOTH platforms (G3 physical-device pass, 2026-08-12). Tab
 * mode has no native header, so the screen owns its own top inset — the
 * MineTabScreen precedent.
 */
import { render, screen } from "@testing-library/react-native";

import { EmergencyScreen } from "../EmergencyScreen";

jest.mock("@/app/BootstrapGate", () => ({
  BootstrapGate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/code-blue/CodeBlueActions", () => ({
  CodeBlueActions: () => null,
}));
jest.mock("@/features/code-blue/CodeBlueViewer", () => ({
  CodeBlueViewer: () => null,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));


describe("EmergencyScreen safe area", () => {
  it("pads the screen container by the top inset so nothing paints into the status bar", async () => {
    await render(<EmergencyScreen />);

    const root = screen.getByTestId("emergency-screen-root");
    expect(root.props.style).toEqual(expect.objectContaining({ paddingTop: 59 }));
  });
});
