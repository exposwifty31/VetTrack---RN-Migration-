/**
 * Pure gating + error-mapping logic for the G4-5 Code Blue MUTATION actions.
 * Framework-free (the `task-form-derive.ts` idiom): no i18n, no RN, no
 * `Date.now()` calls — `nowMs` is threaded so callers stay deterministic.
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

/**
 * POST /api/code-blue/sessions carries THREE independent server gates. The
 * first two are unconditional, they do NOT read the same field, and the
 * difference is the whole reason a picker exists.
 *
 *   Gate 1 — INITIATOR (the caller). TWO middlewares, in this order, reading
 *     two DIFFERENT fields (server/routes/code-blue.ts:288-305):
 *       1a `requireClinicalUser` — the PERMANENT identity `req.authUser.role`
 *          against `CLINICAL_ROLES` (server/middleware/auth.ts:962). Denies 403
 *          code ACCESS_DENIED / reason INSUFFICIENT_ROLE.
 *       1b `requireClinicalAuthority({ allow: ["vet","senior_technician",
 *          "technician"], allowSystemAdmin: false,
 *          allowPermanentClinicalRoleForEmergency: true })` — the SHIFT-derived
 *          `effectiveClinicalRole`. Denies 403 code INSUFFICIENT_ROLE / reason
 *          INSUFFICIENT_CLINICAL_AUTHORITY.
 *     `canInitiateCodeBlue` mirrors BOTH. Collapsing them loses the alias gap:
 *     1a rejects `vet_tech` / `lead_technician`, which 1b's normalizer accepts.
 *     Note the two envelopes disagree on which field carries the useful string,
 *     which is why `codeBlueMutationErrorKey` reads `reason` before `code` — a
 *     code-only mapper would send 1a's ACCESS_DENIED to the generic banner.
 *
 *   Gate 2 — MANAGER (the nominated `managerUserId`). An unconditional DB
 *     check on the manager's PERMANENT role:
 *     `inArray(users.role, ["vet","admin"])` + `status = "active"` + same
 *     clinic (server/routes/code-blue.ts:361-377). Denies 400 INVALID_MANAGER.
 *     This one really is `users.role`, so `canSelfManageCodeBlue` takes the
 *     permanent role and must NOT be switched to the effective one.
 *
 *   Gate 3 — MANAGER OPERATIONAL ROLE. `evaluateCodeBlueManagerForRoute`,
 *     per-clinic `off | shadow | enforce`, default `off`. In `enforce` it can
 *     deny 403 MANAGER_NOT_CODE_BLUE_ELIGIBLE on the manager's check-in-derived
 *     operational role — which GET /api/users/managers does not filter on. The
 *     picker list is therefore advisory, never authoritative; the UI must let
 *     the user pick again after that 403.
 *
 * Because gates 1 and 2 read DIFFERENT fields, the one-tap "start and manage
 * it myself" affordance requires BOTH predicates. Gate 2 alone would offer a
 * one-tap Start to a vet rostered onto an admin shift, whom gate 1 denies.
 */

/**
 * Gate 2 only — the nominated manager's PERMANENT role. Deliberately not the
 * effective role: `vt_shift_role` is an enum of exactly
 * `technician | senior_technician | admin` (server/schema/ops.ts:18), so an
 * on-shift vet's effective role is never "vet", while `users.role` still is —
 * and `users.role` is the column gate 2 actually reads.
 *
 * `admin` is in the list because gate 2's allow-list literally contains it.
 * This predicate is NOT the old "who may start while naming themselves
 * manager" intersection: `allowSystemAdmin: false` never denied admins at
 * gate 1, it only declined to auto-grant them, so an admin holding a clinical
 * shift passes gate 1 on that shift's role and may indeed self-designate.
 * Callers compose the intersection as `canInitiate && canSelfManage`.
 */
const CODE_BLUE_MANAGER_ROLES: ReadonlySet<string> = new Set(["vet", "admin"]);

export function canSelfManageCodeBlue(role: string | null | undefined): boolean {
  return typeof role === "string" && CODE_BLUE_MANAGER_ROLES.has(role);
}

/** Gate 1b's allow-list, verbatim from the route. */
const CODE_BLUE_INITIATOR_ROLES: ReadonlySet<string> = new Set([
  "vet",
  "senior_technician",
  "technician",
]);

/**
 * Gate 1a — `requireClinicalUser`'s `CLINICAL_ROLES`, verbatim
 * (server/middleware/auth.ts:962). A SEPARATE set from the authority
 * allow-list above, on a SEPARATE field (`req.authUser.role`, the permanent
 * identity), checked one middleware EARLIER.
 *
 * Two differences, both load-bearing:
 *   - it contains "admin" (an admin identity clears this gate and is then
 *     judged on their shift role at 1b), and
 *   - it does NOT contain the legacy aliases `normalizeShiftRoleToClinical`
 *     happily accepts — `vet_tech` and `lead_technician`
 *     (server/lib/authority-roles.ts:40-44). So those two identities can hold
 *     a perfectly valid technician / senior_technician SHIFT role, clear 1b on
 *     paper, and still be hard-denied at 1a.
 */
const CODE_BLUE_IDENTITY_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "vet",
  "senior_technician",
  "technician",
]);

/**
 * Gate 1, mirrored on the two fields the server actually consults.
 *
 * The server matches `snapshot.effectiveClinicalRole` — the SHIFT-derived role
 * — and only falls back to the permanent role through the emergency
 * break-glass, which additionally requires `reason === "EZSHIFT_NONE"`, i.e.
 * no active shift at all (server/middleware/authority.ts:130-141, 234-268).
 * So the client mirror is: read the effective role, fall back to the permanent
 * one when none resolved. Three consequences, each verified against the server:
 *
 *   - A permanent ADMIN rostered onto a clinical shift IS granted —
 *     server/lib/authority.ts:14-16 states it explicitly. Gating on the
 *     permanent role alone hides Start from them at the bedside.
 *   - An `admin` SHIFT grants nothing to anyone: `normalizeShiftRoleToClinical`
 *     returns null (reason SHIFT_ROLE_NOT_CLINICAL), and break-glass cannot
 *     rescue it because that path needs EZSHIFT_NONE. A vet on an admin shift
 *     is denied.
 *   - A permanent STUDENT is denied unconditionally and FIRST, even holding an
 *     active clinical shift row (server/lib/authority.ts:10-13) — and is
 *     already excluded by gate 1a, which is checked first here too.
 *   - A permanent VET_TECH or LEAD_TECHNICIAN is denied by gate 1a however
 *     good their shift role is; the shift-role mirror alone would offer them
 *     a picker that always 403s.
 *
 * `||` rather than `??` on purpose: an empty-string effective role is "not
 * resolved" and must fall back, which `??` would not do.
 *
 * Called with one argument, effective and permanent are the same role — which
 * is exactly the off-shift break-glass case.
 */
export function canInitiateCodeBlue(
  effectiveRole: string | null | undefined,
  permanentRole?: string | null,
): boolean {
  // Gate 1a first, in the server's own order. This subsumes the student
  // hard-stop ("student" is not a CLINICAL_ROLE) and additionally catches the
  // alias gap that a shift-role-only mirror cannot see. `?? effectiveRole`
  // honours the one-argument contract AND the fact that `role` is optional on
  // the /me shape — an absent identity role degrades to the effective one
  // rather than hiding Start from a legitimate responder mid-arrest.
  const identityRole = permanentRole ?? effectiveRole;
  if (typeof identityRole !== "string" || !CODE_BLUE_IDENTITY_ROLES.has(identityRole)) {
    return false;
  }
  const resolved = effectiveRole || permanentRole;
  return typeof resolved === "string" && CODE_BLUE_INITIATOR_ROLES.has(resolved);
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
  | "codeBlue.errors.startConflict"
  | "codeBlue.errors.notFound"
  | "codeBlue.errors.notClinical"
  | "codeBlue.errors.managerNotEligible"
  | "codeBlue.errors.invalidManager"
  | "codeBlue.errors.managerOnly"
  | "codeBlue.errors.managerNoLongerEligible"
  | "codeBlue.errors.generic";

/**
 * Server code/reason -> copy key. A `Map` rather than an object literal so a
 * server string can never collide with `Object.prototype`.
 *
 * The three END-path codes are deliberately NOT one key. They are three
 * different situations with three different next actions. A single shared
 * "you're not allowed to do that" key (which all three used to resolve to, now
 * retired) is wrong for all three — it names the CALLER when the server is
 * talking about the nominated MANAGER:
 *
 *   MANAGER_ONLY      403  you are not the manager; the person nominated at
 *                          start is the one who must close it. Recoverable by
 *                          handing the device over — the mirror of the promise
 *                          the picker made (server/routes/code-blue.ts:994).
 *   NO_VET_MANAGER    422  the nominated manager no longer holds vet/admin —
 *   MANAGER_INACTIVE  403  or their account was deactivated. Both mean NOBODY
 *                          can close this session on this path; the only exit
 *                          is an admin. Telling the user "try again" here
 *                          would loop them mid-arrest
 *                          (server/routes/code-blue.ts:1008, 1014).
 *
 * On the START path, CODE_BLUE_START_CONFLICT (409, "retry with the SAME
 * token") is not ACTIVE_SESSION_EXISTS (409, "one already exists") — one asks
 * for a retry, the other says stop and join.
 */
const CODE_BLUE_ERROR_KEYS: ReadonlyMap<string, CodeBlueMutationErrorKey> = new Map([
  // Start path.
  ["ACTIVE_SESSION_EXISTS", "codeBlue.errors.conflict"],
  ["CODE_BLUE_START_CONFLICT", "codeBlue.errors.startConflict"],
  // Gate 1 denial. The envelope carries code INSUFFICIENT_ROLE with reason
  // INSUFFICIENT_CLINICAL_AUTHORITY (server/middleware/authority.ts:302-306),
  // so BOTH spellings are listed and `reason` is consulted first below.
  ["INSUFFICIENT_CLINICAL_AUTHORITY", "codeBlue.errors.notClinical"],
  ["INSUFFICIENT_ROLE", "codeBlue.errors.notClinical"],
  // Gates 2 and 3, on the NOMINATED manager — not on the caller.
  ["INVALID_MANAGER", "codeBlue.errors.invalidManager"],
  ["MANAGER_NOT_CODE_BLUE_ELIGIBLE", "codeBlue.errors.managerNotEligible"],
  // End path.
  ["MANAGER_ONLY", "codeBlue.errors.managerOnly"],
  ["NO_VET_MANAGER", "codeBlue.errors.managerNoLongerEligible"],
  ["MANAGER_INACTIVE", "codeBlue.errors.managerNoLongerEligible"],
  ["SESSION_NOT_FOUND", "codeBlue.errors.notFound"],
]);

/**
 * Coded server / offline-block error -> translated copy key. The
 * `EmergencyOfflineError` check runs FIRST and unconditionally — it is a
 * distinct error class (thrown at the `auth-fetch` transport layer, never an
 * `ApiCodedError`), and per doctrine it must always render the loud,
 * dedicated offline banner rather than falling through to a generic message.
 *
 * `reason` is consulted before `code` because it is the finer-grained of the
 * two: gate 1 sends the generic code INSUFFICIENT_ROLE with the specific
 * reason. Where `reason` is unmapped (CODE_BLUE_START_CONFLICT carries a
 * retry-classification reason such as OWNER_IN_FLIGHT) the lookup falls
 * through to `code`.
 */
export function codeBlueMutationErrorKey(error: unknown): CodeBlueMutationErrorKey {
  if (error instanceof EmergencyOfflineError) return "codeBlue.errors.offline";
  if (error instanceof ApiCodedError) {
    const byReason = error.reason ? CODE_BLUE_ERROR_KEYS.get(error.reason) : undefined;
    return byReason ?? CODE_BLUE_ERROR_KEYS.get(error.code) ?? "codeBlue.errors.generic";
  }
  return "codeBlue.errors.generic";
}
