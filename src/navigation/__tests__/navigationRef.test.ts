/**
 * navigationRef push-tap helpers — the two V2-review guarantees:
 *  1. a tap that arrives before the container is ready is QUEUED and flushed onReady,
 *     never silently dropped (cold-start race);
 *  2. custody-scoped tab sets (no Emergency tab) fall back to Main — a tap never
 *     dead-ends on a NAVIGATE to an unregistered screen.
 */
import {
  flushPendingNavTarget,
  navigateToEmergency,
  navigateToMain,
  navigationRef,
} from "../navigationRef";

jest.mock("@react-navigation/native", () => ({
  createNavigationContainerRef: () => ({
    isReady: jest.fn(() => false),
    navigate: jest.fn(),
    getRootState: jest.fn(() => undefined),
  }),
}));

const ref = navigationRef as unknown as {
  isReady: jest.Mock;
  navigate: jest.Mock;
  getRootState: jest.Mock;
};

function mainTabState(routeNames: string[] | undefined) {
  return {
    routes: [{ name: "Main", state: routeNames ? { routeNames } : undefined }],
  };
}

beforeEach(() => {
  // Drain any pending target left by a previous test, then reset call history.
  ref.isReady.mockReturnValue(true);
  ref.getRootState.mockReturnValue(mainTabState(["Today", "Emergency"]));
  flushPendingNavTarget();
  ref.isReady.mockClear();
  ref.navigate.mockClear();
  ref.getRootState.mockClear();
});

describe("cold-start queueing (finding 2)", () => {
  it("queues an Emergency tap while not ready and flushes it onReady", () => {
    ref.isReady.mockReturnValue(false);
    navigateToEmergency();
    expect(ref.navigate).not.toHaveBeenCalled();

    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(["Today", "Emergency"]));
    flushPendingNavTarget();
    expect(ref.navigate).toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });

  it("queues a Main tap while not ready and flushes it onReady", () => {
    ref.isReady.mockReturnValue(false);
    navigateToMain();
    expect(ref.navigate).not.toHaveBeenCalled();

    ref.isReady.mockReturnValue(true);
    flushPendingNavTarget();
    expect(ref.navigate).toHaveBeenCalledWith("Main");
  });

  it("flush is one-shot — a second flush does not re-navigate", () => {
    ref.isReady.mockReturnValue(false);
    navigateToEmergency();
    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(["Today", "Emergency"]));
    flushPendingNavTarget();
    ref.navigate.mockClear();

    flushPendingNavTarget();
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it("flush while still not ready re-queues instead of dropping", () => {
    ref.isReady.mockReturnValue(false);
    navigateToEmergency();
    flushPendingNavTarget(); // container still not ready — must not drop the target
    expect(ref.navigate).not.toHaveBeenCalled();

    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(["Today", "Emergency"]));
    flushPendingNavTarget();
    expect(ref.navigate).toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });
});

describe("custody-role fallback (finding 1)", () => {
  it("navigates to the nested Emergency screen when the tab is registered", () => {
    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(["Today", "Emergency", "Menu"]));
    navigateToEmergency();
    expect(ref.navigate).toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });

  it("falls back to Main when the mounted tab set provably lacks Emergency", () => {
    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(["Today", "EquipmentTab", "Mine", "Menu"]));
    navigateToEmergency();
    expect(ref.navigate).toHaveBeenCalledWith("Main");
    expect(ref.navigate).not.toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });

  it("attempts the nested navigate while the tab navigator has no state yet (unknown ≠ absent)", () => {
    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(mainTabState(undefined));
    navigateToEmergency();
    expect(ref.navigate).toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });

  it("survives a missing root state (container ready, no routes yet)", () => {
    ref.isReady.mockReturnValue(true);
    ref.getRootState.mockReturnValue(undefined);
    navigateToEmergency();
    expect(ref.navigate).toHaveBeenCalledWith("Main", { screen: "Emergency" });
  });
});
