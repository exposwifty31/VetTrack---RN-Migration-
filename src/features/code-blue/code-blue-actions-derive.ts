/**
 * Pure gating + error-mapping logic for the G4-5 Code Blue MUTATION actions.
 * Framework-free (the `task-form-derive.ts` idiom): no i18n, no RN, no
 * `Date.now()` calls — `nowMs` is threaded so callers stay deterministic.
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

/**
 * POST /api/code-blue/sessions carries THREE independent server gates. Two are
 * unconditional; the client must model both, because they do not have the same
 * allow-list and the difference is the whole reason a picker exists.
 *
 *   Gate 1 — INITIATOR (the caller). `requireClinicalUser` + then
 *     `requireClinicalAuthority({ allow: ["vet","senior_technician",
 *     "technician"], allowSystemAdmin: false,
 *     allowPermanentClinicalRoleForEmergency: true })`
 *     (server/routes/code-blue.ts:288-305). Break-glass: a clinical identity
 *     may open a Code Blue with NO active shift, so PERMANENT role — not
 *     `effectiveRole` — is the right client-side approximation here.
 *     Denies 403 INSUFFICIENT_ROLE.
 *
 *   Gate 2 — MANAGER (the nominated `managerUserId`). An unconditional DB
 *     check on the manager's PERMANENT role:
 *     `inArray(users.role, ["vet","admin"])` + `status = "active"` + same
 *     clinic (server/routes/code-blue.ts:361-377). Denies 400 INVALID_MANAGER.
 *     Same reason `role` and not `effectiveRole`: gate 2 reads `users.role`.
 *
 *   Gate 3 — MANAGER OPERATIONAL ROLE. `evaluateCodeBlueManagerForRoute`,
 *     per-clinic `off | shadow | enforce`, default `off`. In `enforce` it can
 *     deny 403 MANAGER_NOT_CODE_BLUE_ELIGIBLE on the manager's check-in-derived
 *     operational role — which GET /api/users/managers does not filter on. The
 *     picker list is therefore advisory, never authoritative; the UI must let
 *     the user pick again after that 403.
 *
 * `canSelfManageCodeBlue` is the INTERSECTION of gates 1 and 2 — the only role
 * that can start while naming itself manager is "vet" (admin passes gate 2 but
 * is excluded from gate 1). `canInitiateCodeBlue` is gate 1 alone: a
 * senior_technician/technician may start, but MUST nominate someone else.
 */
export function canSelfManageCodeBlue(role: string | null | undefined): boolean {
  return role === "vet";
}

/** Gate 1 alone — see the block above. Mirrors the server's `allow` list verbatim. */
const CODE_BLUE_INITIATOR_ROLES: ReadonlySet<string> = new Set([
  "vet",
  "senior_technician",
  "technician",
]);

export function canInitiateCodeBlue(role: string | null | undefined): boolean {
  return typeof role === "string" && CODE_BLUE_INITIATOR_ROLES.has(role);
}

/** Manager-only close-out gate — mirrors the server's persisted-manager check. */
export function canEndCodeBlue(
  currentUserId: string | null | undefined,
  managerUserId: string,
): boolean {
  return !!currentUserId && currentUserId === managerUserId;
}

/**
 * `max(0, nowMs - startedAt)`, 0 for an unparsable timestamp OR a non-finite
 * `nowMs` — never NaN. (CodeRabbit PR #49: `startMs` was guarded but `nowMs`
 * wasn't, so `Math.max(0, NaN)` could still leak a NaN elapsedMs into a log
 * entry payload.)
 */
export function computeElapsedMsForLog(startedAt: string, nowMs: number): number {
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, nowMs - startMs);
}

/**
 * A pending log-entry draft's stable idempotency entry (the
 * `resolveStableIdempotencyKey` idiom from `dispense-derive.ts`, applied to
 * the Code Blue log form — CodeRabbit PR #49). Keyed by the draft's trimmed
 * text: a RETRY of the identical draft (same signature) reuses the same key
 * so a flaky offline attempt followed by a retry can never double-post the
 * same log entry server-side; the draft only clears (and the key resets to
 * `null`) once the mutation actually succeeds.
 */
export type LogDraftIdempotencyEntry = Readonly<{ key: string; signature: string }>;

export function resolveLogDraftIdempotencyKey(
  previous: LogDraftIdempotencyEntry | null,
  signature: string,
  mint: () => string,
): LogDraftIdempotencyEntry {
  if (previous?.signature === signature) return previous;
  return { key: mint(), signature };
}

/** Literal union so the strictly-typed `t` accepts the mapped result. */
export type CodeBlueMutationErrorKey =
  | "codeBlue.errors.offline"
  | "codeBlue.errors.conflict"
  | "codeBlue.errors.notFound"
  | "codeBlue.errors.forbidden"
  | "codeBlue.errors.managerNotEligible"
  | "codeBlue.errors.invalidManager"
  | "codeBlue.errors.generic";

/**
 * Coded server / offline-block error -> translated copy key. The
 * `EmergencyOfflineError` check runs FIRST and unconditionally — it is a
 * distinct error class (thrown at the `auth-fetch` transport layer, never an
 * `ApiCodedError`), and per doctrine it must always render the loud,
 * dedicated offline banner rather than falling through to a generic message.
 */
export function codeBlueMutationErrorKey(error: unknown): CodeBlueMutationErrorKey {
  if (error instanceof EmergencyOfflineError) return "codeBlue.errors.offline";
  if (error instanceof ApiCodedError) {
    switch (error.code) {
      case "ACTIVE_SESSION_EXISTS":
        return "codeBlue.errors.conflict";
      case "SESSION_NOT_FOUND":
        return "codeBlue.errors.notFound";
      case "MANAGER_ONLY":
      case "MANAGER_INACTIVE":
        return "codeBlue.errors.forbidden";
      // Gates 3 and 2 on the NOMINATED manager — not on the caller. The
      // generic "you're not allowed" copy names the wrong actor and leaves a
      // picker user with no idea that picking someone else would work.
      case "MANAGER_NOT_CODE_BLUE_ELIGIBLE":
        return "codeBlue.errors.managerNotEligible";
      case "INVALID_MANAGER":
        return "codeBlue.errors.invalidManager";
      default:
        return "codeBlue.errors.generic";
    }
  }
  return "codeBlue.errors.generic";
}
