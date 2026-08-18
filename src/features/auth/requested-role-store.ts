/**
 * RN port of the web requested-role-store (C5): a role pre-picked on the
 * sign-in screen is carried to the future sign-up flow so "land -> pick role ->
 * create account" pre-selects the chip. Session-kind storage mirrors the web's
 * sessionStorage choice — the role never travels in a URL or shareable link.
 *
 * Roles are literal `vt_users.role` values (web RoleChips contract) so a
 * downstream consumer of the requested-role tag never needs to remap them.
 *
 * Storage failures degrade silently (read -> null, write -> no-op): the carried
 * role is a nicety and must never crash or block sign-in itself.
 */
import { safeStorageGetItem, safeStorageRemoveItem, safeStorageSetItem } from "@/lib/safe-storage";

export type SignupRequestedRole = "technician" | "vet";

export const REQUESTED_ROLE_STORAGE_KEY = "vt_signup_requested_role";

export function readCarriedRole(): SignupRequestedRole | null {
  try {
    const value = safeStorageGetItem(REQUESTED_ROLE_STORAGE_KEY, "session");
    return value === "vet" || value === "technician" ? value : null;
  } catch {
    return null;
  }
}

export function writeCarriedRole(role: SignupRequestedRole | null): void {
  try {
    if (role) safeStorageSetItem(REQUESTED_ROLE_STORAGE_KEY, role, "session");
    else safeStorageRemoveItem(REQUESTED_ROLE_STORAGE_KEY, "session");
  } catch {
    // Deliberate no-op — see module doc.
  }
}
