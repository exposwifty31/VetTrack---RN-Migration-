/**
 * The EquipmentTab wrapper must own the TOP safe-area inset.
 *
 * `MainTabs` renders its navigator with `headerShown: false`, so in tab mode no
 * native header supplies the top inset and each tab destination has to. Every
 * other destination already does — `MineTabScreen` and `EmergencyScreen` via a
 * padded wrapper, `HomeScreen` and `MenuScreen` internally — but
 * `EquipmentTabScreen` returned `EquipmentListScreen` bare, so the equipment
 * search header painted UNDER the status bar (W3B physical-device run
 * 2026-08-21, iPad Pro 11" and Pixel 7; issue #95).
 *
 * `EquipmentListScreen` is mocked to a leaf: this asserts the WRAPPER's
 * contract, and mounting the real screen would drag FlashList, the realtime
 * sync hook and the search query in without testing anything more.
 */
import { render, screen } from "@testing-library/react-native";

import { EquipmentTabScreen } from "../MainTabs";
import type { MainTabScreenProps } from "../types";

jest.mock("@/screens/EquipmentListScreen", () => ({
  EquipmentListScreen: () => null,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

// The navigator always supplies the full screen props; the wrapper only passes
// them through, so a bare cast is enough to mount it in isolation.
const props = {} as MainTabScreenProps<"EquipmentTab">;

describe("EquipmentTab safe area", () => {
  it("pads the tab container by the top inset so the search header clears the status bar", async () => {
    await render(<EquipmentTabScreen {...props} />);

    const root = screen.getByTestId("equipment-tab-root");
    expect(root.props.style).toEqual(expect.objectContaining({ paddingTop: 59 }));
  });
});
