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
  | "codeBlue.errors.startSuperseded";

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

/**
 * Coded one-tap start error -> translated copy key.
 *
 * ONE code is handled here, and the shape says why: `CODE_BLUE_START_CONFLICT`
 * is the only response whose meaning depends on the route it came from, because
 * its `reason` classifies a fence outcome that only one-tap has. Everything else
 * — including codes this slice once mapped itself — delegates, so there is a
 * single definition of what each server error says.
 *
 * Two codes were deliberately REMOVED from here during the reconcile with the
 * manager-picker slice, and both removals are load-bearing:
 *
 *   INVALID_MANAGER — mapped here to "Your account can't be set as the Code
 *     Blue manager; ask a vet to start it". True only while self-designation
 *     was the sole start path. With a picker on screen the 400 is about the vet
 *     the initiator PICKED, so that copy names the wrong actor and gives an
 *     instruction the user is already following. The shared mapper says "That
 *     manager is no longer available. Pick someone else."
 *
 *   INSUFFICIENT_ROLE / ACCESS_DENIED — mapped here to `codeBlue.errors.
 *     forbidden`, a key the picker slice then retired (it named the CALLER for
 *     errors the server raises about the MANAGER). Keeping a local case would
 *     now render a translation key that exists in neither locale. The shared
 *     mapper reads `reason` before `code`, which is what resolves both:
 *     requireClinicalUser sends {code: ACCESS_DENIED, reason: INSUFFICIENT_ROLE}
 *     and requireClinicalAuthority inverts the two.
 */
export function oneTapStartErrorKey(error: unknown): OneTapStartErrorKey {
  if (error instanceof ApiCodedError && error.code === "CODE_BLUE_START_CONFLICT") {
    return startConflictKey(error.reason);
  }
  // EmergencyOfflineError, INVALID_MANAGER, MANAGER_NOT_CODE_BLUE_ELIGIBLE,
  // INSUFFICIENT_ROLE, INTERNAL_ERROR, and every non-Error value: one shared
  // definition, not a second copy.
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
