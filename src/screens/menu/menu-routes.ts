/**
 * Menu front-door route map (G3 Slice 12) — the single source of truth for what
 * the Menu links to, extracted so it is compile-checked (every `route` must be a
 * param-free root-stack route) AND unit-testable without rendering the screen.
 *
 * `EquipmentDetail` / `RoomDetail` require ids, so they are NOT top-level menu
 * entries (a Menu tap has no id to pass); they are reached from their list
 * screens. Everything here is a `navigation.navigate("<Route>")` with no params.
 *
 * The Developer entries are BUILD-GATED (Settings wave): the debug launchers show
 * only in a `__DEV__` build, and G2Measure only when EXPO_PUBLIC_ENABLE_MEASURE
 * is "true" (a measurement build — its G3 exit-pass path). A real release build
 * (neither) exposes NO developer tools. See `computeDeveloperEntries`.
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
 * The `__DEV__`-only debug launchers: SignIn (a dev shortcut — the SignIn screen
 * itself stays registered and is reached in a release via sign-out / bootstrap
 * reauth) plus the five pure-debug screens.
 */
const DEBUG_LAUNCHERS = [
  { route: "SignIn", labelKey: "nav.signIn" },
  { route: "ApiSmoke", labelKey: "nav.apiSmoke" },
  { route: "NfcSpike", labelKey: "nav.nfcSpike" },
  { route: "StorageDebug", labelKey: "nav.storageDebug" },
  { route: "RealtimeDebug", labelKey: "nav.realtimeDebug" },
  { route: "I18nDebug", labelKey: "nav.i18nDebug" },
] as const satisfies readonly MenuEntry[];

/**
 * G2Measure has no other UI entry point; it is reached ONLY when a measurement
 * build sets EXPO_PUBLIC_ENABLE_MEASURE="true" (the G3 exit-pass). Build one with
 * the eas.json `measure` profile: internal distribution, so the screen never
 * reaches the store, but pinned to the `production` EAS environment so the
 * artifact still gets the API origin and Clerk key it needs to run at all.
 * Do NOT set it in the `production` profile — that ships the screen to users.
 */
const MEASURE_ENTRY = { route: "G2Measure", labelKey: "nav.g2Measure" } as const satisfies MenuEntry;

/**
 * Build-gated developer entries (pure — flags injected so it is unit-testable):
 * `__DEV__` exposes the debug launchers; the measure flag adds G2Measure. A real
 * release build (both false) returns [] → the Developer section renders nothing.
 */
export function computeDeveloperEntries(
  flags: Readonly<{ isDev: boolean; measureEnabled: boolean }>,
): readonly MenuEntry[] {
  return [
    ...(flags.isDev ? DEBUG_LAUNCHERS : []),
    ...(flags.measureEnabled ? [MEASURE_ENTRY] : []),
  ];
}

/** The developer entries for THIS build (empty in a real release). */
export const DEVELOPER_ENTRIES = computeDeveloperEntries({
  isDev: __DEV__,
  measureEnabled: process.env.EXPO_PUBLIC_ENABLE_MEASURE === "true",
});

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
