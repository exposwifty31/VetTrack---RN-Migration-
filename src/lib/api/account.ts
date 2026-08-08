/**
 * Account API module (G3 Slice 12) — the "account essentials" write path a
 * daily driver needs from the Menu front door. Per G3-PLAN §2 rule 3 new
 * domains never grow `src/lib/api.ts`; each ships its own typed fns on the
 * shared coded-error plumbing (`src/lib/api/coded-error.ts`).
 *
 * Server truth (verified 2026-08-09 against the Capacitor repo
 * `server/routes/users.ts:644`, read-only):
 *   - PATCH /api/users/:id/display_name  requireAuthAny + validateUuid("id") +
 *     validateBody({ display_name: string, trim, 1–60 }). Self-or-admin: a
 *     non-self non-admin caller gets 403 {code:"FORBIDDEN", reason:
 *     "INSUFFICIENT_ROLE"}; a stale id → 404 {code:"NOT_FOUND"}. On success it
 *     returns the FULL updated user row (`res.json(updated)`), so the DB
 *     `displayName` (camelCase) is the field of record. Audit
 *     `user_display_name_changed`. `clinicId` is derived server-side — never sent.
 *
 * The `:id` is always the current user's own id (from the identity hook); the
 * screen pre-gates the affordance on `hasRoleAtLeast`-free self-edit (any signed
 * in user may rename themselves) and disables Save until identity resolves.
 *
 * G5: this repo deliberately ships NO account-deletion or avatar-upload call.
 * Both stores (Apple + Google) mandate in-app account deletion
 * (DELETE /api/users/delete-account) before store submission — that lands in the
 * G5 store-submission slice, not the G3 daily-driver gate. The web deletion page
 * already exists as the interim path.
 */
import * as Crypto from "expo-crypto";

import { requestJson } from "@/lib/api/coded-error";

/** Max display-name length the server accepts (patchDisplayNameSchema). */
export const DISPLAY_NAME_MAX_LENGTH = 60;

/**
 * The subset of the updated user row the account editor reconciles. The route
 * returns the whole row; we model only identity + the field we changed so a
 * wider server shape never breaks the client.
 */
export type UpdatedAccountUser = Readonly<{
  id: string;
  displayName: string | null;
}>;

/** Per-attempt request id for server-side tracing (the established scan idiom). */
function mutationHeaders(): Record<string, string> {
  return { "x-request-id": Crypto.randomUUID() };
}

/**
 * True when `value` is a display name the server will accept: non-empty after
 * trimming and ≤ DISPLAY_NAME_MAX_LENGTH. Pure — reused by the editor to gate
 * Save without a round-trip, mirroring the server Zod bound.
 */
export function isValidDisplayName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= DISPLAY_NAME_MAX_LENGTH;
}

export const accountApi = {
  /**
   * PATCH /api/users/:id/display_name — rename self. `userId` is
   * `encodeURIComponent`-ed (CWE-29 path-safety, the established idiom); the
   * body carries the SERVER field name `display_name`; the value is trimmed to
   * match the server's `z.string().trim()`.
   */
  updateDisplayName: async (
    userId: string,
    displayName: string,
  ): Promise<UpdatedAccountUser> =>
    requestJson<UpdatedAccountUser>(
      `/api/users/${encodeURIComponent(userId)}/display_name`,
      {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName.trim() }),
        headers: mutationHeaders(),
      },
    ),
};
