/**
 * W3a / B1 deep-linking: the native side already registers verified handlers for
 * `https://vettrack.uk/equipment/*` and the `vettrack://` scheme, but the
 * NavigationContainer had NO `linking` prop — a cold-boot universal link opened
 * Home and discarded the equipment id. This pins the JS linking config that
 * closes that gap. (Android on-device verification stays blocked per J11; the
 * config itself is OS-agnostic and testable here.)
 */
import { getStateFromPath } from "@react-navigation/native";

import { UNIVERSAL_LINK_HOST } from "@/lib/equipment-id";

import { linking } from "../linking";

describe("navigation linking config", () => {
  it("registers the universal-link host and the custom scheme as prefixes", () => {
    expect(linking.prefixes).toContain(`https://${UNIVERSAL_LINK_HOST}`);
    expect(linking.prefixes).toContain("vettrack://");
  });

  it("maps /equipment/:id to EquipmentDetail carrying the equipmentId", () => {
    const state = getStateFromPath("equipment/eq1", linking.config);
    expect(state).toBeTruthy();

    // Walk to the deepest route — EquipmentDetail sits on the root stack.
    type RouteEntry = {
      name: string;
      params?: Record<string, unknown>;
      state?: { routes: RouteEntry[] };
    };
    const root = state as unknown as { routes: RouteEntry[] };
    let route = root.routes[root.routes.length - 1];
    while (route.state) {
      route = route.state.routes[route.state.routes.length - 1];
    }

    expect(route.name).toBe("EquipmentDetail");
    expect(route.params).toMatchObject({ equipmentId: "eq1" });
  });

  it("does not resolve an unrelated path to a route", () => {
    const state = getStateFromPath("totally/unknown/path", linking.config);
    const names = state?.routes.map((r) => r.name) ?? [];
    expect(names).not.toContain("EquipmentDetail");
  });
});
