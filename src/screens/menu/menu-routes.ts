/**
 * Menu front-door route map (G3 Slice 12) — the single source of truth for what
 * the Menu links to, extracted so it is compile-checked (every `route` must be a
 * param-free root-stack route) AND unit-testable without rendering the screen.
 *
 * `EquipmentDetail` / `RoomDetail` require ids, so they are NOT top-level menu
 * entries (a Menu tap has no id to pass); they are reached from their list
 * screens. Everything here is a `navigation.navigate("<Route>")` with no params.
 *
 * The Developer entries preserve EVERY debug screen reachable from the old
 * debug-launcher Menu — nothing is deleted. They render under a section that is
 * collapsed by default but ALWAYS rendered (NOT `__DEV__`-gated), so G2Measure
 * stays reachable on a release build for the exit-pass (see MenuScreen).
 */
import { isCustodyScopedRole } from "@/navigation/main-tab-set";
import type { RootStackParamList } from "@/navigation/types";

/** Root-stack routes navigable without params — keeps the map compile-checked. */
export type ParamFreeRoute = {
  [K in keyof RootStackParamList]: undefined extends RootStackParamList[K] ? K : never;
}[keyof RootStackParamList];

/** i18n label keys used by the menu (literal union → typed `t()` accepts them). */
export type MenuLabelKey =
  | "nav.tasks"
  | "nav.rooms"
  | "nav.myEquipment"
  | "nav.alerts"
  | "nav.inventory"
  | "nav.autopilotQueue"
  | "menu.endShift"
  | "nav.signIn"
  | "nav.apiSmoke"
  | "nav.nfcSpike"
  | "nav.storageDebug"
  | "nav.realtimeDebug"
  | "nav.i18nDebug"
  | "nav.g2Measure";

export type MenuEntry = Readonly<{ route: ParamFreeRoute; labelKey: MenuLabelKey }>;

/**
 * Operations — the daily-driver surfaces. `MyEquipment` ("Mine") is the
 * non-student entry point (students get the Mine TAB from Slice 4); MenuScreen
 * filters it out for custody-scoped roles so it is not shown twice.
 */
export const OPERATIONS_ENTRIES = [
  { route: "Tasks", labelKey: "nav.tasks" },
  { route: "Rooms", labelKey: "nav.rooms" },
  { route: "MyEquipment", labelKey: "nav.myEquipment" },
  { route: "Alerts", labelKey: "nav.alerts" },
  { route: "Inventory", labelKey: "nav.inventory" },
  { route: "AutopilotQueue", labelKey: "nav.autopilotQueue" },
] as const satisfies readonly MenuEntry[];

/** Session — end-of-shift handover. */
export const SESSION_ENTRIES = [
  { route: "Handoff", labelKey: "menu.endShift" },
] as const satisfies readonly MenuEntry[];

/**
 * Developer — every debug/dev screen from the old Menu, preserved. Rendered under
 * a collapsed-by-default but ALWAYS-rendered section (not `__DEV__`-gated) so
 * every screen — G2Measure especially — stays reachable on a release build.
 */
export const DEVELOPER_ENTRIES = [
  { route: "SignIn", labelKey: "nav.signIn" },
  { route: "ApiSmoke", labelKey: "nav.apiSmoke" },
  { route: "NfcSpike", labelKey: "nav.nfcSpike" },
  { route: "StorageDebug", labelKey: "nav.storageDebug" },
  { route: "RealtimeDebug", labelKey: "nav.realtimeDebug" },
  { route: "I18nDebug", labelKey: "nav.i18nDebug" },
  { route: "G2Measure", labelKey: "nav.g2Measure" },
] as const satisfies readonly MenuEntry[];

/** The custody-scoped-only entry hidden from the Operations list for students. */
export const CUSTODY_HIDDEN_ROUTE: ParamFreeRoute = "MyEquipment";

/**
 * The Operations entries visible for a given effective role. Custody-scoped roles
 * (student/viewer) already get "Mine" as a bottom TAB (Slice 4), so the Menu omits
 * ONLY that entry for them; every other role — and an unresolved role — keeps the
 * full set. Pure (no rendering) so the filtering is unit-testable directly.
 */
export function visibleOperationsEntries(
  effectiveRole: string | null | undefined,
): readonly MenuEntry[] {
  return isCustodyScopedRole(effectiveRole)
    ? OPERATIONS_ENTRIES.filter((entry) => entry.route !== CUSTODY_HIDDEN_ROUTE)
    : OPERATIONS_ENTRIES;
}
