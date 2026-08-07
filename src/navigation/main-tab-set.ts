/**
 * Pure tab-set derivation for MainTabs — extracted so the role→tabs decision
 * is unit-testable without mounting a navigator.
 *
 * Web parity (vettrack `src/native/NativeTabBar.tsx` + `roles/experience-model.ts`,
 * read 2026-08-07): custody-only archetypes = { student } — a student's entire
 * system footprint is equipment custody, so the bar swaps the Emergency tab for
 * a dedicated "Mine" (my equipment) tab and stays inside the custody scope.
 * Per G3-PLAN Slice 4 the RN swap keys on `effectiveRole` (the same identity
 * field every other RN pre-gate reads). "viewer" is the legacy student alias
 * (server `normalizeUserRole` / task-permissions precedent).
 *
 * An unresolved/unknown role derives the STANDARD set (Emergency) — identical
 * to the pre-Slice-4 bar, so the pending-identity frame shows nothing new.
 */
import type { MainTabParamList } from "./types";

export type MainTabName = keyof MainTabParamList;

/** Custody-scoped roles: student (+ its legacy "viewer" alias). */
export function isCustodyScopedRole(effectiveRole: string | null | undefined): boolean {
  const normalized = (effectiveRole ?? "").trim().toLowerCase();
  return normalized === "student" || normalized === "viewer";
}

const STANDARD_TABS: readonly MainTabName[] = ["Today", "EquipmentTab", "Emergency", "Menu"];
const CUSTODY_TABS: readonly MainTabName[] = ["Today", "EquipmentTab", "Mine", "Menu"];

/** The ordered tab set for a role — exactly one of Emergency | Mine, never both. */
export function deriveMainTabSet(
  effectiveRole: string | null | undefined,
): readonly MainTabName[] {
  return isCustodyScopedRole(effectiveRole) ? CUSTODY_TABS : STANDARD_TABS;
}
