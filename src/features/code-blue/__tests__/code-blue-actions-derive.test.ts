/**
 * Pure derivation tests for the G4-5 mutation-gating + error-mapping logic.
 * No RN, no react-query — framework-free (the `task-form-derive` idiom).
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

import {
  canEndCodeBlue,
  canStartCodeBlue,
  codeBlueMutationErrorKey,
  computeElapsedMsForLog,
} from "../code-blue-actions-derive";

describe("canStartCodeBlue", () => {
  it("allows a vet to self-designate as manager and start", () => {
    expect(canStartCodeBlue("vet")).toBe(true);
  });

  it("denies non-vet clinical roles (no self-manager eligibility)", () => {
    expect(canStartCodeBlue("senior_technician")).toBe(false);
    expect(canStartCodeBlue("technician")).toBe(false);
    expect(canStartCodeBlue("student")).toBe(false);
    expect(canStartCodeBlue("admin")).toBe(false);
  });

  it("denies an unresolved role", () => {
    expect(canStartCodeBlue(undefined)).toBe(false);
    expect(canStartCodeBlue(null)).toBe(false);
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
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_ONLY"))).toBe(
      "codeBlue.errors.forbidden",
    );
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_NOT_CODE_BLUE_ELIGIBLE"))).toBe(
      "codeBlue.errors.forbidden",
    );
    expect(codeBlueMutationErrorKey(new ApiCodedError(403, "MANAGER_INACTIVE"))).toBe(
      "codeBlue.errors.forbidden",
    );
  });

  it("degrades an unknown coded error and any non-coded error to the generic key", () => {
    expect(codeBlueMutationErrorKey(new ApiCodedError(500, "INTERNAL_ERROR"))).toBe(
      "codeBlue.errors.generic",
    );
    expect(codeBlueMutationErrorKey(new Error("boom"))).toBe("codeBlue.errors.generic");
    expect(codeBlueMutationErrorKey(null)).toBe("codeBlue.errors.generic");
  });
});
