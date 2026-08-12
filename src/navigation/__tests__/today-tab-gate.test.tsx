/**
 * The Today tab must be identity-GATED like every other data screen (the
 * error-wall fix): while identity is pending the gate's loading state renders
 * and HomeScreen does NOT mount, so its card queries can never fire before
 * `users/me` populates `currentUserId` (the cold-start race) and an identity
 * failure surfaces the gate's reauth screen instead of per-card error soup.
 */
import { render, screen } from "@testing-library/react-native";

import { useIdentity } from "@/app/useIdentity";

import { TodayTabScreen } from "../TodayTabScreen";

jest.mock("@/screens/HomeScreen", () => ({
  HomeScreen: () => {
    const RN = jest.requireActual<typeof import("react-native")>("react-native");
    return <RN.Text>HOME-STUB</RN.Text>;
  },
}));
jest.mock("@/app/useIdentity", () => ({
  useIdentity: jest.fn(),
}));
jest.mock("@/lib/auth-store", () => ({ getCurrentUserId: () => null }));
jest.mock("@/infrastructure/auth/authSession", () => ({
  isAuthSessionActive: () => false,
  subscribeAuthSession: () => () => {},
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockedUseIdentity = useIdentity as jest.Mock;

describe("Today tab identity gate", () => {
  it("renders the gate's loading state (NOT HomeScreen) while identity is pending", async () => {
    mockedUseIdentity.mockReturnValue({ isPending: true, isSuccess: false, data: undefined });

    await render(<TodayTabScreen />);

    expect(screen.queryByText("HOME-STUB")).toBeNull();
  });

  it("mounts HomeScreen only after identity resolves with a userId", async () => {
    mockedUseIdentity.mockReturnValue({
      isPending: false,
      isSuccess: true,
      data: { id: "u1", effectiveRole: "technician" },
    });
    const authStore = jest.requireMock<{ getCurrentUserId: () => string | null }>(
      "@/lib/auth-store",
    );
    authStore.getCurrentUserId = () => "u1";

    await render(<TodayTabScreen />);

    expect(screen.getByText("HOME-STUB")).toBeTruthy();
  });
});
