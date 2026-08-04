/**
 * Numeric role hierarchy — mirrors the server (CLAUDE.md / auth). Used to pre-gate
 * UI affordances on the SAME field the server enforces (`effectiveRole`).
 */
const ROLE_RANK: Record<string, number> = {
  admin: 40,
  vet: 30,
  senior_technician: 25,
  lead_technician: 22,
  vet_tech: 20,
  technician: 20,
  student: 10,
};

export function roleRank(role: string | undefined | null): number {
  if (!role) return 0;
  return ROLE_RANK[role] ?? 0;
}

/** True when `role` meets or exceeds the rank of `minRole`. */
export function hasRoleAtLeast(role: string | undefined | null, minRole: string): boolean {
  return roleRank(role) >= roleRank(minRole);
}

/**
 * Undo (/revert) is `requireEffectiveRole('vet')` server-side; a sub-vet scanner
 * receives an undoToken the server will 403. Gate the affordance on the same field.
 */
export function canUndoScan(effectiveRole: string | undefined | null): boolean {
  return hasRoleAtLeast(effectiveRole, "vet");
}
