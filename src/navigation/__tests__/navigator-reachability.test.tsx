/**
 * Navigator reachability contract.
 *
 * Every other suite in this repo tests a screen, a hook, or a pure route-list in
 * isolation — the navigator itself was rendered ZERO times, so a route name could
 * be produced by one module (Menu, tab set, push deep-link) and registered by
 * nobody, and every test would still pass. This suite closes that hole: it MOUNTS
 * the real `RootNavigator` inside a real `NavigationContainer`, reads the route
 * names React Navigation actually registered, and cross-references them against
 * every module that routes somewhere:
 *
 *   1. `src/screens/menu/menu-routes.ts`            — Menu front-door destinations
 *   2. `src/navigation/main-tab-set.ts`             — role-derived bottom tabs
 *   3. `resolvePushNavTarget` (push deep-link)      — notification-tap targets
 *   4. in-screen `navigation.navigate("X")` literals — the id-carrying and
 *      chrome routes (Settings, Scan, EquipmentDetail, RoomDetail, …) that are
 *      deliberately NOT menu rows and would otherwise go unasserted
 *
 * `useIdentity` is the one mock: it is the role source MainTabs derives its tab
 * set from, so it has to be driven per-role, and mocking it also keeps the Today
 * tab's BootstrapGate from firing network queries. Everything else — the stack,
 * the tab navigator, the screen registrations — is the real thing.
 *
 * WHAT THIS SUITE UNIQUELY COVERS, AND WHAT IT DOES NOT
 * The pure sibling `main-tab-set.test.ts` already owns the role→tab-set
 * DERIVATION and would catch a tab being dropped from STANDARD_TABS/CUSTODY_TABS
 * on its own. What no pure test can see is the other half: whether the tab set
 * the derivation produces is what the live navigator REGISTERS. `MainTabs`
 * registers through a `renderTabScreen` switch, so a dropped `case` unregisters
 * a tab while the derivation still names it — invisible to every pure test, and
 * visible here because the tab names are read off the mounted navigator's state.
 *
 * DIRECTIONALITY — THE FAILURE MODE THIS SUITE HAD AND NO LONGER HAS
 * A "derived ⊆ registered" assertion is one-directional: SHRINKING the derived
 * set satisfies it vacuously. Deleting "Menu" from both tab sets makes every
 * menu destination unreachable to a real user, and left every assertion here
 * green. The tab-set block below therefore pins the registered set with an
 * exact `toEqual` against a hardcoded per-role expectation — an independent
 * statement of intent, in the same spirit as NAVIGATE_DESTINATIONS — and the
 * menu block asserts the Menu tab itself is registered, because "the Menu's
 * destinations are registered" says nothing if the user cannot reach the Menu.
 */
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";
import { useIdentity } from "@/app/useIdentity";
import type { PushData } from "@/core/ports/push.port";
import { resolvePushNavTarget } from "@/infrastructure/push/push-deep-link";
import {
  DEVELOPER_ENTRIES,
  OPERATIONS_ENTRIES,
  SESSION_ENTRIES,
} from "@/screens/menu/menu-routes";

import { deriveMainTabSet, type MainTabName } from "../main-tab-set";
import { RootNavigator } from "../RootNavigator";
import type { RootStackParamList } from "../types";

jest.mock("@/app/useIdentity", () => ({
  useIdentity: jest.fn(),
  IDENTITY_QUERY_KEY: ["users", "me"],
}));

const mockedUseIdentity = useIdentity as jest.Mock;

// SafeAreaProvider needs metrics up front: without them `useSafeAreaInsets`
// (AuroraTabBar, MineTabScreen) suspends on a native measurement that never
// arrives under jest.
const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type MountedNavigator = {
  /** Route names registered on the root native-stack. */
  stackRoutes: readonly string[];
  /** Route names registered on the nested MainTabs bottom-tab navigator. */
  tabRoutes: readonly string[];
};

/**
 * Mount the REAL RootNavigator for a given effective role and report what
 * React Navigation registered. Reading `routeNames` off the live navigation
 * state (not the JSX) is what makes this a wiring check rather than a re-read
 * of the same source lists.
 */
async function mountNavigator(effectiveRole: string | null): Promise<MountedNavigator> {
  mockedUseIdentity.mockReturnValue(
    effectiveRole === null
      ? { isPending: true, isSuccess: false, data: undefined, error: null }
      : { isPending: false, isSuccess: true, data: { id: "u1", effectiveRole }, error: null },
  );

  const navigationRef = createNavigationContainerRef<RootStackParamList>();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navigationRef}>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

  // A screen that fails to register (a dropped `renderTabScreen` case, a
  // navigator handed an undefined child) blows up during render and the
  // container never becomes ready — say so explicitly instead of timing out on
  // an opaque `expect(false).toBe(true)`.
  await waitFor(() => {
    if (!navigationRef.isReady()) {
      throw new Error(
        `NavigationContainer never became ready for effectiveRole=${String(effectiveRole)} — ` +
          "the navigator failed to mount (see the render error above).",
      );
    }
  });

  const rootState = navigationRef.getRootState();
  const stackRoutes = rootState?.routeNames ?? [];
  const mainRoute = rootState?.routes.find((route) => route.name === "Main");
  const tabRoutes = (mainRoute?.state as { routeNames?: string[] } | undefined)?.routeNames ?? [];

  // A mounted stack with no nested tab state means MainTabs never rendered —
  // report that loudly rather than letting the tab assertions vacuously pass.
  expect(stackRoutes.length).toBeGreaterThan(0);
  expect(tabRoutes.length).toBeGreaterThan(0);

  return { stackRoutes, tabRoutes };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("navigator reachability — menu destinations", () => {
  it("registers every root-stack route the Menu can navigate to", async () => {
    const { stackRoutes, tabRoutes } = await mountNavigator("technician");

    // The Menu is a TAB, and it is the only front door to the destinations
    // asserted below. Without this line the whole test is conditional on a fact
    // it never checks: deleting "Menu" from the tab sets makes every one of
    // those destinations unreachable to a real user while the ⊆ assertion below
    // stays green, because it only ever checks that registered ⊇ derived.
    expect(tabRoutes).toContain("Menu");

    const menuDestinations = [
      ...OPERATIONS_ENTRIES,
      ...SESSION_ENTRIES,
      ...DEVELOPER_ENTRIES,
    ].map((entry) => entry.route);

    // Guard against a vacuous pass if the menu lists are ever emptied.
    expect(menuDestinations.length).toBeGreaterThan(0);

    const unregistered = menuDestinations.filter((route) => !stackRoutes.includes(route));
    expect(unregistered).toEqual([]);
  });
});

describe("navigator reachability — in-screen navigate() destinations", () => {
  /**
   * Every route name any screen navigates to by literal. Deliberately HARDCODED
   * rather than derived from RootNavigator: derived, it would restate the
   * registration and pass tautologically. This list is an independent statement
   * of intent, so unregistering a screen breaks it.
   *
   * Regenerate by grepping src (excluding __tests__) for `navigate("` followed
   * by a quoted route literal, and taking the unique route names. The
   * `navigate({ name: ... })`, `push()` and `replace()` forms have no
   * occurrences in src as of this test — re-check them too if one appears.
   */
  const NAVIGATE_DESTINATIONS = [
    "Alerts", // HomeScreen
    "EquipmentDetail", // AlertsScreen, HomeScreen, MyEquipmentScreen
    "EquipmentList", // HomeScreen, ScanScreen
    "Inventory", // InventoryScreen, ScanScreen, pending-container
    "Main", // navigationRef, SignInScreen
    "RoomDetail", // RoomsScreen
    "Scan", // EquipmentListScreen, HomeScreen
    "ScanConfirm", // EquipmentDetailScreen, EquipmentListScreen, ScanScreen
    "Settings", // HomeScreen (the gear — it regressed to the Menu tab once)
    "ShiftChat", // HomeScreen
    "SignIn", // BootstrapGate (reauth), MenuScreen
    "Tasks", // HomeScreen
  ] as const;

  it("registers every route a screen navigates to by name", async () => {
    const { stackRoutes, tabRoutes } = await mountNavigator("technician");
    const reachable = new Set<string>([...stackRoutes, ...tabRoutes]);

    const unregistered = NAVIGATE_DESTINATIONS.filter((route) => !reachable.has(route));
    expect(unregistered).toEqual([]);
  });
});

describe("navigator reachability — role-derived tab set", () => {
  /**
   * The expected bottom-tab bar per role, HARDCODED for the same reason
   * NAVIGATE_DESTINATIONS is: derived from `deriveMainTabSet`, the expectation
   * would restate its input and shrink with it. Standard roles get Emergency;
   * custody-scoped roles (student + its legacy "viewer" alias) swap it for Mine.
   * Order is asserted too — it is the bar's left-to-right layout, and Menu being
   * last is UX worth pinning.
   */
  const TAB_SET_CASES: [label: string, role: string | null, expectedTabs: MainTabName[]][] = [
    ["an unresolved role (pending identity)", null, ["Today", "EquipmentTab", "Emergency", "Menu"]],
    ["a standard role", "technician", ["Today", "EquipmentTab", "Emergency", "Menu"]],
    ["an admin role", "admin", ["Today", "EquipmentTab", "Emergency", "Menu"]],
    ["a custody-scoped role (student)", "student", ["Today", "EquipmentTab", "Mine", "Menu"]],
    ["the legacy custody alias (viewer)", "viewer", ["Today", "EquipmentTab", "Mine", "Menu"]],
  ];

  it.each(TAB_SET_CASES)(
    "registers exactly the expected tab set for %s",
    async (_label, role, expectedTabs) => {
      const { tabRoutes } = await mountNavigator(role);

      // THE load-bearing assertion, and the one thing no pure test can make:
      // what the LIVE navigator registered, pinned in both directions. A tab
      // dropped from STANDARD_TABS/CUSTODY_TABS reds this (the old `derived ⊆
      // registered` form did not — shrinking the derived set satisfied it), and
      // so does a `renderTabScreen` case going missing while the derivation
      // still names the tab.
      expect(tabRoutes).toEqual(expectedTabs);

      // The wiring claim: the navigator registers what the derivation produces,
      // rather than a hardcoded list that happens to agree. Overlaps
      // main-tab-set.test.ts by design — that suite owns the derivation, this
      // line is what ties it to the registration asserted above.
      expect([...deriveMainTabSet(role)]).toEqual(expectedTabs);
    },
  );
});

describe("navigator reachability — push deep-link targets", () => {
  // Every branch of resolvePushNavTarget: emergency by type, by url, and the
  // catch-all. Whatever screen names these produce must exist in the navigator.
  const PUSH_PAYLOADS: readonly PushData[] = [
    { type: "code_blue_started" },
    { type: "code-blue-ended" },
    { type: "EMERGENCY_ALERT" },
    { url: "/board/code-blue/123" },
    { url: "/emergency" },
    { type: "equipment_return_reminder", url: "/equipment/42" },
    {},
    undefined,
  ];

  it("registers every screen a notification tap can route to", async () => {
    const { stackRoutes, tabRoutes } = await mountNavigator("technician");
    const reachable = new Set<string>([...stackRoutes, ...tabRoutes]);

    const targets = [...new Set(PUSH_PAYLOADS.map((data) => resolvePushNavTarget(data).screen))];
    expect(targets.length).toBeGreaterThan(0);

    const unreachable = targets.filter((screen) => !reachable.has(screen));
    expect(unreachable).toEqual([]);
  });

  it("keeps the custody-role fallback target (Main) registered", async () => {
    // A custody-scoped tab set has no Emergency tab, so navigationRef falls back
    // to "Main". That fallback is only safe while Main is a registered route.
    const { stackRoutes, tabRoutes } = await mountNavigator("student");

    expect(tabRoutes).not.toContain("Emergency");
    expect(stackRoutes).toContain("Main");
  });
});
