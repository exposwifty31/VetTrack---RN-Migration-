/**
 * Pure derivation tests for the G4-5 mutation-gating + error-mapping logic.
 * No RN, no react-query — framework-free (the `task-form-derive` idiom).
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

import {
  canEndCodeBlue,
  canInitiateCodeBlue,
  canSelfManageCodeBlue,
  codeBlueMutationErrorKey,
  computeElapsedMsForLog,
  resolveLogDraftIdempotencyKey,
} from "../code-blue-actions-derive";

describe("canSelfManageCodeBlue — server gate 2 alone (the vet/admin allow-list on users.role)", () => {
  it("allows a vet", () => {
    expect(canSelfManageCodeBlue("vet")).toBe(true);
  });

  /**
   * Gate 2's allow-list literally contains "admin". This predicate is no
   * longer the conflated "may start AND manage" intersection — callers compose
   * that as `canInitiate && canSelfManage` — because `allowSystemAdmin: false`
   * never denied admins at gate 1, it only declined to auto-grant them
   * (server/middleware/authority.ts:229-232). An admin holding a clinical
   * shift passes gate 1 on that shift's role and may self-designate.
   */
  it("allows an admin — gate 2 accepts them, and an admin on a clinical shift clears gate 1 too", () => {
    expect(canSelfManageCodeBlue("admin")).toBe(true);
  });

  it("denies senior_technician/technician — valid initiators, but NOT valid managers", () => {
    expect(canSelfManageCodeBlue("senior_technician")).toBe(false);
    expect(canSelfManageCodeBlue("technician")).toBe(false);
  });


  it("denies student and an unresolved role", () => {
    expect(canSelfManageCodeBlue("student")).toBe(false);
    expect(canSelfManageCodeBlue(undefined)).toBe(false);
    expect(canSelfManageCodeBlue(null)).toBe(false);
  });
});

describe("canInitiateCodeBlue — server gate 1 (requireClinicalAuthority allow-list)", () => {
  it("allows every clinical role the server lets POST /sessions", () => {
    expect(canInitiateCodeBlue("vet")).toBe(true);
    expect(canInitiateCodeBlue("senior_technician")).toBe(true);
    expect(canInitiateCodeBlue("technician")).toBe(true);
  });

  it("denies admin — allowSystemAdmin:false excludes system-admin identity from the emergency gate", () => {
    expect(canInitiateCodeBlue("admin")).toBe(false);
  });

  it("denies student and an unresolved role", () => {
    expect(canInitiateCodeBlue("student")).toBe(false);
    expect(canInitiateCodeBlue(undefined)).toBe(false);
    expect(canInitiateCodeBlue(null)).toBe(false);
  });
});

describe("canEndCodeBlue", () => {
  it("allows only the persisted session manager to end", () => {
    expect(canEndCodeBlue("user-1", "user-1")).toBe(true);
    expect(canEndCodeBlue("user-2", "user-1")).toBe(false);
  });

  it("denies an unresolved current-user id", () => {
    expect(canEndCodeBlue(undefined, "user-1")).toBe(false);
    expect(canEndCodeBlue(null, "user-1")).toBe(false);
  });
});

describe("computeElapsedMsForLog", () => {
  it("computes non-negative elapsed ms from a valid startedAt", () => {
    expect(computeElapsedMsForLog("2026-08-10T12:00:00.000Z", Date.parse("2026-08-10T12:03:00.000Z"))).toBe(
      180_000,
    );
  });

  it("clamps to 0 rather than going negative under clock skew", () => {
    expect(computeElapsedMsForLog("2026-08-10T12:03:00.000Z", Date.parse("2026-08-10T12:00:00.000Z"))).toBe(0);
  });

  it("returns 0 for an unparsable startedAt (never NaN)", () => {
    expect(computeElapsedMsForLog("not-a-date", Date.now())).toBe(0);
  });

  it("returns 0 when nowMs itself is non-finite — CodeRabbit PR #49 (never NaN via Math.max(0, NaN))", () => {
    expect(computeElapsedMsForLog("2026-08-10T12:00:00.000Z", NaN)).toBe(0);
    expect(computeElapsedMsForLog("2026-08-10T12:00:00.000Z", Infinity)).toBe(0);
  });
});

describe("resolveLogDraftIdempotencyKey — CodeRabbit PR #49 (stable key across a retry)", () => {
  it("mints a fresh key when there is no previous entry", () => {
    const mint = jest.fn(() => "uuid-a");
    const entry = resolveLogDraftIdempotencyKey(null, "Amiodarone 300mg", mint);
    expect(entry).toEqual({ key: "uuid-a", signature: "Amiodarone 300mg" });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("reuses the previous key when the signature (draft text) is unchanged — a retry, not a new entry", () => {
    const previous = { key: "uuid-a", signature: "Amiodarone 300mg" };
    const mint = jest.fn(() => "uuid-b");
    const entry = resolveLogDraftIdempotencyKey(previous, "Amiodarone 300mg", mint);
    expect(entry).toBe(previous); // same object — no new key minted
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints a NEW key when the draft text actually changed", () => {
    const previous = { key: "uuid-a", signature: "Amiodarone 300mg" };
    const mint = jest.fn(() => "uuid-b");
    const entry = resolveLogDraftIdempotencyKey(previous, "Different note", mint);
    expect(entry).toEqual({ key: "uuid-b", signature: "Different note" });
    expect(mint).toHaveBeenCalledTimes(1);
  });
});

describe("codeBlueMutationErrorKey", () => {
  it("maps EmergencyOfflineError to the loud offline key — BEFORE any coded-error check", () => {
    const err = new EmergencyOfflineError("start", "/api/code-blue/sessions", "POST");
    expect(codeBlueMutationErrorKey(err)).toBe("codeBlue.errors.offline");
  });

  it("maps known coded server errors to specific keys", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(409, "ACTIVE_SESSION_EXISTS"))).toBe(
      "codeBlue.errors.conflict",
    );
    expect(codeBlueMutationErrorKey(new ApiCodedError(404, "SESSION_NOT_FOUND"))).toBe(
      "codeBlue.errors.notFound",
    );
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_NOT_CODE_BLUE_ELIGIBLE"))).toBe(
      "codeBlue.errors.managerNotEligible",
    );
    expect(codeBlueMutationErrorKey(new ApiCodedError(400, "INVALID_MANAGER"))).toBe(
      "codeBlue.errors.invalidManager",
    );
    // MANAGER_ONLY / MANAGER_INACTIVE / NO_VET_MANAGER assert in the END-path
    // describe below: they used to share `forbidden`, and no longer do.
  });

  it("degrades an unknown coded error and any non-coded error to the generic key", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(500, "INTERNAL_ERROR"))).toBe(
      "codeBlue.errors.generic",
    );
    expect(codeBlueMutationErrorKey(new Error("boom"))).toBe("codeBlue.errors.generic");
    expect(codeBlueMutationErrorKey(null)).toBe("codeBlue.errors.generic");
  });
});

/**
 * The END path is a THREE-error ladder server-side, and the three are not
 * interchangeable (server/routes/code-blue.ts:994/1008/1014). Collapsing them
 * onto `forbidden` ("You're not allowed to do that") tells a technician
 * mid-arrest to stop, when two of the three actually mean "nobody can close
 * this — escalate", and the third means "the person you nominated must".
 */
describe("codeBlueMutationErrorKey — the END path is three outcomes, not one 'forbidden'", () => {
  it("maps MANAGER_ONLY to its own key — the mirror of the promise the picker made", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_ONLY"))).toBe(
      "codeBlue.errors.managerOnly",
    );
  });

  it("maps NO_VET_MANAGER (422) to an ESCALATION — the nominated manager no longer qualifies, so this session cannot be closed by anyone on this path", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(422, "NO_VET_MANAGER"))).toBe(
      "codeBlue.errors.managerNoLongerEligible",
    );
  });

  it("maps MANAGER_INACTIVE to the SAME escalation — deactivated account, same dead end, same remedy", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_INACTIVE"))).toBe(
      "codeBlue.errors.managerNoLongerEligible",
    );
  });
});

describe("codeBlueMutationErrorKey — START-path codes", () => {
  /**
   * The envelope sends `code: "INSUFFICIENT_ROLE"` with
   * `reason: "INSUFFICIENT_CLINICAL_AUTHORITY"` (server/middleware/authority.ts:302-306).
   * A mapper that only switches on `code` would never fire on the reason
   * string — so `reason` must be consulted too.
   */
  it("maps INSUFFICIENT_CLINICAL_AUTHORITY, which arrives as the REASON while the code is INSUFFICIENT_ROLE", () => {
    expect(
      codeBlueMutationErrorKey(
        new ApiCodedError(403, "INSUFFICIENT_ROLE", "INSUFFICIENT_CLINICAL_AUTHORITY"),
      ),
    ).toBe("codeBlue.errors.notClinical");
  });

  it("maps CODE_BLUE_START_CONFLICT (409, 'retry with the SAME token') distinctly from ACTIVE_SESSION_EXISTS ('one already exists')", () => {
    expect(
      codeBlueMutationErrorKey(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "OWNER_IN_FLIGHT")),
    ).toBe("codeBlue.errors.startConflict");
    expect(codeBlueMutationErrorKey(new ApiCodedError(409, "ACTIVE_SESSION_EXISTS"))).toBe(
      "codeBlue.errors.conflict",
    );
  });
});

/**
 * Requirement 3 — gate 1 is matched on the SHIFT-derived role, not the
 * permanent one. `vt_shift_role` is an enum of exactly
 * `technician | senior_technician | admin` (server/schema/ops.ts:18) — "vet"
 * is NOT a shift role — so the permanent role and the effective role diverge
 * routinely, and the server resolves each of these cases explicitly:
 *
 *   - permanent admin + clinical shift -> GRANTED. server/lib/authority.ts:14-16
 *     says so in as many words: "A user whose permanent role is 'admin' but
 *     who picks up a clinical shift row still gains that shift's clinical
 *     authority for the shift's duration."
 *   - any permanent role + `admin` shift -> DENIED. `normalizeShiftRoleToClinical`
 *     returns null, so `effectiveClinicalRole` is null with reason
 *     SHIFT_ROLE_NOT_CLINICAL — and the emergency break-glass is unreachable
 *     because `isPermanentRoleFallbackEligible` additionally requires
 *     `reason === "EZSHIFT_NONE"` (server/middleware/authority.ts:130-141).
 *   - permanent student -> DENIED unconditionally, checked FIRST, even with an
 *     active clinical shift row (server/lib/authority.ts:10-13).
 */
describe("canInitiateCodeBlue — gate 1 reads the EFFECTIVE (shift) role, falling back to permanent", () => {
  it("grants a permanent ADMIN who is rostered onto a clinical shift — the server grants exactly this", () => {
    expect(canInitiateCodeBlue("technician", "admin")).toBe(true);
  });

  it("denies a permanent VET rostered onto an ADMIN shift — an admin shift is not clinical authority, and break-glass needs EZSHIFT_NONE", () => {
    expect(canInitiateCodeBlue("admin", "vet")).toBe(false);
  });

  it("denies a permanent STUDENT even when rostered onto a technician shift — the server's student hard-stop runs first", () => {
    expect(canInitiateCodeBlue("technician", "student")).toBe(false);
  });

  it("falls back to the permanent role when no effective role resolved — the off-shift break-glass responder", () => {
    expect(canInitiateCodeBlue(null, "vet")).toBe(true);
    expect(canInitiateCodeBlue("", "senior_technician")).toBe(true);
  });
});
