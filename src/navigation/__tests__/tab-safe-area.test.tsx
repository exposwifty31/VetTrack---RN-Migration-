/**
 * Tab-mode screens have NO native header, so whatever mounts a screen into a tab
 * owns the TOP safe-area inset. Two tabs — EquipmentTab and Mine — are thin
 * wrappers that adapt a root-stack screen into the tab layer, which makes the
 * wrapper the only place that inset can come from.
 *
 * MineTabScreen did this and EquipmentTabScreen did not (issue #95): the
 * equipment search header painted under the status bar on every notch/Dynamic
 * Island device, and on iPad it sat under the clock — which is what blocked the
 * Lane 1a store screenshots.
 *
 * This suite is deliberately data-driven over BOTH wrappers rather than
 * asserting the one that broke. The bug was never "EquipmentTab is wrong", it
 * was "a sibling can be added without the inset and nothing notices" — the same
 * shape as the EmergencyScreen top-inset defect before
 * `emergency-safe-area.test.tsx`. A third cast-wrapper tab added tomorrow has to
 * be listed here, and listing it is what forces the decision.
 */
import { render, screen } from "@testing-library/react-native";

import { EquipmentTabScreen, MineTabScreen } from "../MainTabs";

const TOP_INSET = 59;

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: TOP_INSET, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/screens/EquipmentListScreen", () => ({
  EquipmentListScreen: () => null,
}));
jest.mock("@/screens/MyEquipmentScreen", () => ({
  MyEquipmentScreen: () => null,
}));

const WRAPPERS = [
  { name: "EquipmentTab", testID: "equipment-tab-root", Component: EquipmentTabScreen },
  { name: "Mine", testID: "mine-tab-root", Component: MineTabScreen },
] as const;

describe("tab wrappers own the top safe-area inset", () => {
  it.each(WRAPPERS)(
    "$name pads its container by the top inset so nothing paints into the status bar",
    async ({ testID, Component }) => {
      await render(<Component {...({} as any)} />);

      const root = screen.getByTestId(testID);
      expect(root.props.style).toEqual(
        expect.objectContaining({ paddingTop: TOP_INSET }),
      );
    },
  );
});
