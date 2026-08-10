/**
 * G4-5 wiring check — the mutation action bar is an entry point that must
 * actually be reachable, not dead code sitting next to the frozen read-only
 * viewer. Both mount inside the same `BootstrapGate`.
 */
import { render, screen } from "@testing-library/react-native";

import { EmergencyScreen } from "../EmergencyScreen";

jest.mock("@/app/BootstrapGate", () => ({
  BootstrapGate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/code-blue/CodeBlueActions", () => ({
  CodeBlueActions: () => {
    const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>__CodeBlueActions__</Text>;
  },
}));

jest.mock("@/features/code-blue/CodeBlueViewer", () => ({
  CodeBlueViewer: () => {
    const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>__CodeBlueViewer__</Text>;
  },
}));

describe("EmergencyScreen wiring", () => {
  it("mounts both the mutation action bar and the read-only viewer", async () => {
    await render(<EmergencyScreen />);
    expect(screen.getByText("__CodeBlueActions__")).toBeTruthy();
    expect(screen.getByText("__CodeBlueViewer__")).toBeTruthy();
  });
});
