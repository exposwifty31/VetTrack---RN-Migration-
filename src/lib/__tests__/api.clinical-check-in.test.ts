/**
 * Shape tests for the clinical check-in module (doctor shift gate, Task 1).
 * Contract verified against vettrack feat/doctor-shift-gate
 * (server/routes/clinical-check-in.ts, 2026-08-13):
 *   - POST /api/clinical-check-in/check-in and /switch share the body
 *     `{operationalRole, isSenior?, replaceSenior?, source?: "doctor_gate"}`;
 *     the gate MUST stamp `source: "doctor_gate"` on BOTH (it writes immutable
 *     provenance the 14h auto-expiry sweep filters on). Optional
 *     Idempotency-Key header supported on both.
 *   - POST /api/clinical-check-in/check-out → closed row.
 *   - GET /api/clinical-check-in/me/active → `{active: row | null}`.
 *   - 409 SENIOR_ALREADY_ASSIGNED carries `details.currentSeniorName`
 *     which MAY BE NULL (race path).
 */
import {
  SENIOR_ALREADY_ASSIGNED,
  clinicalCheckInApi,
  clinicalCheckInKeys,
  readSeniorConflict,
} from "../api/clinical-check-in";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-request-uuid" }));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

const ROW = {
  id: "ci-1",
  clinicId: "clinic-1",
  userId: "user-1",
  operationalRole: "icu",
  isSenior: false,
  clinicalRoleAtCheckIn: "vet",
  checkedInAt: "2026-08-13T06:00:00.000Z",
  checkedOutAt: null,
  checkOutReason: null,
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("clinicalCheckInKeys", () => {
  it("nests the active key under the canonical root", () => {
    expect(clinicalCheckInKeys.all).toEqual(["clinical-check-in"]);
    expect(clinicalCheckInKeys.active).toEqual(["clinical-check-in", "active"]);
  });
});

describe("clinicalCheckInApi.active", () => {
  it("GETs /me/active and returns the {active} envelope", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { active: ROW }));

    const body = await clinicalCheckInApi.active();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/clinical-check-in/me/active", undefined);
    expect(body).toEqual({ active: ROW });
  });

  it("passes through the no-active-row null", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { active: null }));

    await expect(clinicalCheckInApi.active()).resolves.toEqual({ active: null });
  });
});

describe("clinicalCheckInApi.open", () => {
  it("POSTs /check-in with the team role, isSenior, and the doctor_gate source stamp", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, ROW));

    const row = await clinicalCheckInApi.open({ operationalRole: "icu", isSenior: false });

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/clinical-check-in/check-in");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      operationalRole: "icu",
      isSenior: false,
      source: "doctor_gate",
    });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(row).toEqual(ROW);
  });

  it("carries replaceSenior on the retry-after-conflict body", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ...ROW, isSenior: true }));

    await clinicalCheckInApi.open({
      operationalRole: "admission",
      isSenior: true,
      replaceSenior: true,
    });

    const [, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      operationalRole: "admission",
      isSenior: true,
      replaceSenior: true,
      source: "doctor_gate",
    });
  });

  it("sets the Idempotency-Key header only when the caller provides one", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, ROW));

    await clinicalCheckInApi.open({ operationalRole: "icu" }, { idempotencyKey: "gate-key-1" });
    await clinicalCheckInApi.open({ operationalRole: "icu" });

    const [, withKey] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    const [, withoutKey] = mockAuthFetch.mock.calls[1] as [string, RequestInit];
    expect((withKey.headers as Record<string, string>)["Idempotency-Key"]).toBe("gate-key-1");
    expect(withoutKey.headers as Record<string, string>).not.toHaveProperty("Idempotency-Key");
  });

  it("surfaces SENIOR_NOT_ELIGIBLE as a coded 403", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "SENIOR_NOT_ELIGIBLE", reason: "SENIOR_NOT_ELIGIBLE" }),
    );

    await expect(clinicalCheckInApi.open({ operationalRole: "icu", isSenior: true }))
      .rejects.toMatchObject({ status: 403, code: "SENIOR_NOT_ELIGIBLE" });
  });
});

describe("clinicalCheckInApi.switchRole", () => {
  it("POSTs /switch with the same doctor_gate-stamped body contract", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ...ROW, operationalRole: "admission" }));

    await clinicalCheckInApi.switchRole({ operationalRole: "admission", isSenior: false });

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/clinical-check-in/switch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      operationalRole: "admission",
      isSenior: false,
      source: "doctor_gate",
    });
  });

  it("supports the optional Idempotency-Key header too", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, ROW));

    await clinicalCheckInApi.switchRole(
      { operationalRole: "internal_medicine" },
      { idempotencyKey: "gate-key-2" },
    );

    const [, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("gate-key-2");
  });
});

describe("clinicalCheckInApi.close", () => {
  it("POSTs /check-out with no body and returns the closed row", async () => {
    const closed = { ...ROW, checkedOutAt: "2026-08-13T14:00:00.000Z", checkOutReason: "self" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, closed));

    const row = await clinicalCheckInApi.close();

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/clinical-check-in/check-out");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(row).toEqual(closed);
  });
});

describe("readSeniorConflict (409 SENIOR_ALREADY_ASSIGNED narrowing)", () => {
  it("extracts details.currentSeniorName from the coded 409", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, {
        code: SENIOR_ALREADY_ASSIGNED,
        reason: SENIOR_ALREADY_ASSIGNED,
        details: { currentSeniorName: "ד\"ר כהן" },
      }),
    );

    const err = await clinicalCheckInApi
      .open({ operationalRole: "icu", isSenior: true })
      .then(() => null, (e: unknown) => e);

    expect(err).toMatchObject({ status: 409, code: SENIOR_ALREADY_ASSIGNED });
    expect(readSeniorConflict(err)).toEqual({ currentSeniorName: "ד\"ר כהן" });
  });

  it("falls back to a null name when details omit it (race path)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, {
        code: SENIOR_ALREADY_ASSIGNED,
        reason: SENIOR_ALREADY_ASSIGNED,
        details: { currentSeniorName: null },
      }),
    );

    const err = await clinicalCheckInApi
      .open({ operationalRole: "icu", isSenior: true })
      .then(() => null, (e: unknown) => e);

    expect(readSeniorConflict(err)).toEqual({ currentSeniorName: null });
  });

  it("returns null for every non-conflict error", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(422, { code: "SENIOR_REQUIRES_TEAM_ROLE", reason: "SENIOR_REQUIRES_TEAM_ROLE" }),
    );

    const err = await clinicalCheckInApi
      .open({ operationalRole: "icu", isSenior: true })
      .then(() => null, (e: unknown) => e);

    expect(readSeniorConflict(err)).toBeNull();
    expect(readSeniorConflict(null)).toBeNull();
    expect(readSeniorConflict(new Error("network"))).toBeNull();
  });
});
