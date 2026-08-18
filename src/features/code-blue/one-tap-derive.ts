/**
 * J1 — pure derivation for the one-tap Code Blue start
 * (`POST /api/code-blue/one-tap`). Framework-free, like
 * `code-blue-actions-derive.ts`.
 *
 * WHY A SEPARATE MODULE: `code-blue-actions-derive.ts` is owned by the
 * parallel manager-picker workflow, so this slice adds rather than edits.
 * `oneTapStartErrorKey` handles ONLY the codes unique to the one-tap route and
 * DELEGATES everything else to `codeBlueMutationErrorKey` — the two mappings
 * therefore cannot drift, and the offline-banner rule stays defined in exactly
 * one place.
 */
import { ApiCodedError } from "@/lib/api/coded-error";

import { codeBlueMutationErrorKey, type CodeBlueMutationErrorKey } from "./code-blue-actions-derive";

/**
 * Widened key union: every key the shared mapper can return, plus the three
 * one-tap-only ones. A superset, so it stays assignable wherever a
 * `CodeBlueMutationErrorKey` is produced.
 */
export type OneTapStartErrorKey =
  | CodeBlueMutationErrorKey
  | "codeBlue.errors.startPending"
  | "codeBlue.errors.startSuperseded"
  | "codeBlue.errors.startInvalidManager";

/**
 * The 409 `CODE_BLUE_START_CONFLICT` reasons, split because each one demands a
 * DIFFERENT operator action — collapsing them would reintroduce exactly the
 * ambiguity one-tap exists to remove (the legacy `POST /sessions` returned an
 * opaque `ACTIVE_SESSION_EXISTS` whether your own start had committed or
 * someone else had beaten you to it):
 *   - ACTIVE_SESSION_EXISTS — a different start won; join the running session.
 *   - ACTIVE_LEASE          — YOUR claim is mid-flight; wait, then press again
 *                             (the same token replays onto the same session).
 *   - FENCE_SUPERSEDED      — a newer attempt took the fence; stop and re-read.
 */
function startConflictKey(reason: string | null): OneTapStartErrorKey {
  switch (reason?.toUpperCase()) {
    case "ACTIVE_LEASE":
      return "codeBlue.errors.startPending";
    case "FENCE_SUPERSEDED":
      return "codeBlue.errors.startSuperseded";
    // ACTIVE_SESSION_EXISTS, plus any reason a future server adds: a 409 on
    // start always means a session is in play, so "generic" would be a lie.
    default:
      return "codeBlue.errors.conflict";
  }
}

/** Coded one-tap start error -> translated copy key. */
export function oneTapStartErrorKey(error: unknown): OneTapStartErrorKey {
  if (error instanceof ApiCodedError) {
    switch (error.code) {
      case "CODE_BLUE_START_CONFLICT":
        return startConflictKey(error.reason);
      case "INVALID_MANAGER":
        return "codeBlue.errors.startInvalidManager";
      // `requireClinicalAuthority` / `requireAuth` denials. The shared mapper
      // does not cover these (it predates the one-tap route's middleware
      // chain), and they are plainly permission failures, not "generic".
      case "INSUFFICIENT_ROLE":
      case "ACCESS_DENIED":
        return "codeBlue.errors.forbidden";
      default:
        break;
    }
  }
  // EmergencyOfflineError, MANAGER_NOT_CODE_BLUE_ELIGIBLE, INTERNAL_ERROR,
  // and every non-Error value: one shared definition, not a second copy.
  return codeBlueMutationErrorKey(error);
}

/**
 * The idempotency fence. A token is minted ONCE per start gesture and reused
 * verbatim across every retry of that gesture: the server's
 * `vt_code_blue_start_claims` row is keyed on it, so a retry after a lost
 * response REPLAYS the original session (`outcome: "replay"`) instead of
 * racing a second start. Re-minting per attempt would defeat the fence
 * entirely — that is the whole reason this route exists.
 *
 * A blank previous token is not a token: `oneTapStartSchema` requires
 * `min(1)`, and an empty string would 400 with a bare `Validation failed`
 * envelope (no `code`), surfacing as the generic banner. Re-mint instead.
 */
export function resolveOneTapStartToken(
  previous: string | null | undefined,
  mint: () => string,
): string {
  if (typeof previous === "string" && previous.trim().length > 0) return previous;
  return mint();
}
