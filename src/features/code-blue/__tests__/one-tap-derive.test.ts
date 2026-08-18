/**
 * J1 — one-tap start: error mapping + the idempotency-token fence.
 *
 * Lives in its OWN module (not `code-blue-actions-derive.ts`) because that
 * file is owned by the parallel manager-picker workflow. `oneTapStartErrorKey`
 * DELEGATES every non-one-tap code to `codeBlueMutationErrorKey` rather than
 * re-implementing it, so the two mappings can never drift.
 */
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";

import { oneTapStartErrorKey, resolveOneTapStartToken } from "../one-tap-derive";

describe("oneTapStartErrorKey — the three 409 reasons stay distinct", () => {
  /**
   * The whole point of one-tap: `/sessions` collapsed "my own start already
   * committed" and "someone else beat me" into one opaque 409. One-tap splits
   * them via `reason`, and each demands a DIFFERENT operator action, so they
   * must never render the same string.
   */
  it("ACTIVE_SESSION_EXISTS -> conflict (someone else already started one)", () => {
    const err = new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "ACTIVE_SESSION_EXISTS");
    expect(oneTapStartErrorKey(err)).toBe("codeBlue.errors.conflict");
  });

  it("ACTIVE_LEASE -> startPending (your own attempt is still landing — press again)", () => {
    const err = new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "ACTIVE_LEASE");
    expect(oneTapStartErrorKey(err)).toBe("codeBlue.errors.startPending");
  });

  it("FENCE_SUPERSEDED -> startSuperseded (a newer attempt took over)", () => {
    const err = new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "FENCE_SUPERSEDED");
    expect(oneTapStartErrorKey(err)).toBe("codeBlue.errors.startSuperseded");
  });

  it("all three 409 reasons map to three DIFFERENT keys (no silent collapse)", () => {
    const keys = ["ACTIVE_SESSION_EXISTS", "ACTIVE_LEASE", "FENCE_SUPERSEDED"].map((reason) =>
      oneTapStartErrorKey(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", reason)),
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("an unrecognised/absent 409 reason still reads as a start conflict, never generic", () => {
    expect(oneTapStartErrorKey(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", null))).toBe(
      "codeBlue.errors.conflict",
    );
    expect(oneTapStartErrorKey(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "FUTURE_REASON"))).toBe(
      "codeBlue.errors.conflict",
    );
  });
});

describe("oneTapStartErrorKey — the rest of the one-tap error surface", () => {
  it("400 INVALID_MANAGER names the PICKED manager, not the caller's own account", () => {
    // Reconciled with the manager-picker slice. While self-designation was the
    // only start path, this slice owned a `startInvalidManager` key reading
    // "Your account can't be set as the manager — ask a vet to start it".
    // With a picker on screen that is the wrong actor AND an instruction the
    // user is already following, so the case delegates to the shared mapper.
    expect(oneTapStartErrorKey(new ApiCodedError(400, "INVALID_MANAGER", "INVALID_MANAGER"))).toBe(
      "codeBlue.errors.invalidManager",
    );
  });

  it("the shared-middleware 403s resolve through the shared mapper's reason-first lookup", () => {
    // requireClinicalAuthority: code INSUFFICIENT_ROLE / reason
    // INSUFFICIENT_CLINICAL_AUTHORITY. requireClinicalUser inverts the two.
    // Both land on the same copy, which is why neither is mapped locally.
    expect(oneTapStartErrorKey(new ApiCodedError(403, "INSUFFICIENT_ROLE", "INSUFFICIENT_CLINICAL_AUTHORITY"))).toBe(
      "codeBlue.errors.notClinical",
    );
    expect(oneTapStartErrorKey(new ApiCodedError(403, "ACCESS_DENIED", "INSUFFICIENT_ROLE"))).toBe(
      "codeBlue.errors.notClinical",
    );
    // KNOWN THIN SPOT, pinned rather than hidden: the tenancy/account reasons
    // in the ACCESS_DENIED union (MISSING_CLINIC_ID, TENANT_MISMATCH,
    // ACCOUNT_BLOCKED, …) are in neither mapper and read as the generic
    // banner. They are not start-specific and are not this slice's to name.
    expect(oneTapStartErrorKey(new ApiCodedError(403, "ACCESS_DENIED", "MISSING_CLINIC_ID"))).toBe(
      "codeBlue.errors.generic",
    );
  });

  it("delegates to codeBlueMutationErrorKey for shared codes (403 manager-eligibility, 500)", () => {
    expect(
      oneTapStartErrorKey(new ApiCodedError(403, "MANAGER_NOT_CODE_BLUE_ELIGIBLE", "NO_OPEN_CHECK_IN")),
    ).toBe("codeBlue.errors.managerNotEligible");
    expect(oneTapStartErrorKey(new ApiCodedError(500, "INTERNAL_ERROR", "ONE_TAP_START_FAILED"))).toBe(
      "codeBlue.errors.generic",
    );
  });

  it("EmergencyOfflineError still wins outright — the loud offline banner is non-negotiable", () => {
    const offline = new EmergencyOfflineError("start", "/api/code-blue/one-tap", "POST");
    expect(oneTapStartErrorKey(offline)).toBe("codeBlue.errors.offline");
  });

  it("a non-Error value falls back to generic rather than throwing", () => {
    expect(oneTapStartErrorKey("boom")).toBe("codeBlue.errors.generic");
    expect(oneTapStartErrorKey(null)).toBe("codeBlue.errors.generic");
  });
});

describe("resolveOneTapStartToken — the fence", () => {
  it("mints a token when there is no previous attempt in flight", () => {
    const mint = jest.fn(() => "tok-1");
    expect(resolveOneTapStartToken(null, mint)).toBe("tok-1");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("REUSES the previous token — a retry of the same gesture must re-send it (that IS the fence)", () => {
    const mint = jest.fn(() => "tok-2");
    expect(resolveOneTapStartToken("tok-1", mint)).toBe("tok-1");
    expect(mint).not.toHaveBeenCalled();
  });

  it("re-mints when the previous token is blank — the server requires min(1) and would 400", () => {
    const mint = jest.fn(() => "tok-fresh");
    expect(resolveOneTapStartToken("", mint)).toBe("tok-fresh");
    expect(resolveOneTapStartToken("   ", mint)).toBe("tok-fresh");
  });
});
