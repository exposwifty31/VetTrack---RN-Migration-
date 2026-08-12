import { createNavigationContainerRef } from "@react-navigation/native";

import type { RootStackParamList } from "./types";

/**
 * Container ref for navigation driven from OUTSIDE the React tree — specifically a
 * push-notification tap, which is a global native callback with no navigation
 * context. Attached to `<NavigationContainer ref={navigationRef}>` in App.tsx.
 *
 * A tap handler must not use `useNavigation`: a headless bridge sits beside the
 * navigator (a sibling, not a descendant of `Stack.Navigator`), where the hook
 * throws. The ref is the sanctioned seam and keeps the bridge nav-context-free.
 *
 * ADR-009: these helpers ONLY navigate — they never read or write emergency state.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type PushNavTarget = "Emergency" | "Main";

// A tap can fire before the container mounts (cold start launched from a push).
// getInitialResponseData usually loses that race, but on a slow Android cold start it
// can win — and a plain early-return would silently drop the tap. Stash the target and
// let App.tsx flush it from the container's onReady.
let pendingNavTarget: PushNavTarget | null = null;

/** Flush a push-tap target that arrived before the container was ready (App.tsx onReady). */
export function flushPendingNavTarget(): void {
  const target = pendingNavTarget;
  pendingNavTarget = null;
  if (target === "Emergency") navigateToEmergency();
  else if (target === "Main") navigateToMain();
}

// Whether the mounted Main tab navigator registers an Emergency tab. `undefined` while
// the tab navigator has no state yet (not mounted) — distinct from a provable `false`.
function emergencyTabRegistered(): boolean | undefined {
  const main = navigationRef.getRootState()?.routes.find((route) => route.name === "Main");
  const routeNames = (main?.state as { routeNames?: string[] } | undefined)?.routeNames;
  return routeNames ? routeNames.includes("Emergency") : undefined;
}

/** Navigate to the Emergency screen (tab under Main). Queues until the container is ready. */
export function navigateToEmergency(): void {
  if (!navigationRef.isReady()) {
    pendingNavTarget = "Emergency";
    return;
  }
  // Custody-scoped tab sets (student/viewer) have no Emergency tab, and a NAVIGATE to an
  // unregistered nested screen is a no-op — the tap would dead-end. When the tab state is
  // mounted and provably lacks Emergency, land on Main instead. When it isn't mounted yet
  // (unknown ≠ absent), attempt the nested navigate — the root still resolves Main, so the
  // user lands in the app either way.
  if (emergencyTabRegistered() === false) {
    navigationRef.navigate("Main");
    return;
  }
  navigationRef.navigate("Main", { screen: "Emergency" });
}

/** Navigate to the app root (Main tabs). Queues until the container is ready. */
export function navigateToMain(): void {
  if (!navigationRef.isReady()) {
    pendingNavTarget = "Main";
    return;
  }
  navigationRef.navigate("Main");
}
