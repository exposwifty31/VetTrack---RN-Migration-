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
  resolveLogDraftIdempotencyKey,
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
