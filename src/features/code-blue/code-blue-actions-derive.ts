/**
 * Pure gating + error-mapping logic for the G4-5 Code Blue MUTATION actions.
 * Framework-free (the `task-form-derive.ts` idiom): no i18n, no RN, no
 * `Date.now()` calls — `nowMs` is threaded so callers stay deterministic.
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

/**
 * Client-side Start eligibility. The server allows any clinical role (vet /
 * senior_technician / technician) to POST /sessions, but `managerUserId` must
 * reference an active vet or admin (server/routes/code-blue.ts). This slice
 * scopes Start to self-designating as manager — the only role that is BOTH a
 * valid initiator AND a valid manager is "vet". A senior_technician/technician
 * can still be present and log/end via other affordances; nominating a
 * different manager is a future manager-picker slice, not built here.
 */
export function canStartCodeBlue(role: string | null | undefined): boolean {
  return role === "vet";
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
      case "MANAGER_NOT_CODE_BLUE_ELIGIBLE":
      case "MANAGER_INACTIVE":
        return "codeBlue.errors.forbidden";
      default:
        return "codeBlue.errors.generic";
    }
  }
  return "codeBlue.errors.generic";
}
