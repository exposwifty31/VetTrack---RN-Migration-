/**
 * Numeric role hierarchy — mirrors the server (CLAUDE.md / auth). Used to pre-gate
 * UI affordances on the SAME field the server enforces (`effectiveRole`).
 */
const ROLE_RANK = {
  admin: 40,
  vet: 30,
  senior_technician: 25,
  lead_technician: 22,
  vet_tech: 20,
  technician: 20,
  student: 10,
} as const;

/** The known role keys — `minRole` must be one so a typo can't pass the check. */
export type RoleKey = keyof typeof ROLE_RANK;

export function roleRank(role: string | undefined | null): number {
  if (!role) return 0;
  return (ROLE_RANK as Record<string, number>)[role] ?? 0;
}

/**
 * True when `role` meets or exceeds the rank of `minRole`. `minRole` is typed to a
 * known role key: an unknown key ranks 0, so a misspelled literal would make the
 * comparison `rank >= 0` (always true) — the type stops that at compile time.
 */
export function hasRoleAtLeast(role: string | undefined | null, minRole: RoleKey): boolean {
  return roleRank(role) >= ROLE_RANK[minRole];
}

/**
 * Undo (/revert) is `requireEffectiveRole('vet')` server-side; a sub-vet scanner
 * receives an undoToken the server will 403. Gate the affordance on the same field.
 */
export function canUndoScan(effectiveRole: string | undefined | null): boolean {
  return hasRoleAtLeast(effectiveRole, "vet");
}
