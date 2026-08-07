/**
 * Shape + validation-mirror tests for the shift-adjustments module (Slice 5).
 * The create body is the verified server contract — `kind` (NOT `type`),
 * REQUIRED `requestedEndTime` (server TIME_RE), `reason` 3–500 — and the
 * client mirror reproduces the server's validation order and the
 * overnight-aware direction check from shift-adjustment-window.ts.
 */
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  SHIFT_ADJUSTMENT_AUDIT_ACTION_TYPES,
  isValidAdjustmentTime,
  shiftAdjustmentKeys,
  shiftAdjustmentsApi,
  validateAdjustmentRequest,
} from "../api/shift-adjustments";

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
  id: "adj-1",
  kind: "extend" as const,
  requesterUserId: "user-1",
  requesterName: "Dana",
  baseShiftDate: "2026-08-07",
  currentEndTime: "16:00:00",
  requestedEndTime: "18:00:00",
  reason: "צוות חסר בערב",
  status: "pending" as const,
  decisionNote: null,
  decidedAt: null,
  createdAt: "2026-08-07T08:00:00.000Z",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("shiftAdjustmentKeys", () => {
  it("nests list keys under the canonical root", () => {
    expect(shiftAdjustmentKeys.all).toEqual(["shiftAdjustments"]);
    expect(shiftAdjustmentKeys.list()).toEqual(["shiftAdjustments", "list"]);
    expect(shiftAdjustmentKeys.list("pending")).toEqual(["shiftAdjustments", "list", "pending"]);
  });
});

describe("shiftAdjustmentsApi.create", () => {
  it("POSTs the verified body: kind + requestedEndTime + reason", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(201, ROW));

    const created = await shiftAdjustmentsApi.create({
      kind: "extend",
      requestedEndTime: "18:00",
      reason: "צוות חסר בערב",
    });

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-adjustments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "extend",
      requestedEndTime: "18:00",
      reason: "צוות חסר בערב",
    });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(created).toEqual(ROW);
  });

  it("surfaces the coded 409/400 rejections with their reason", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "CONFLICT", reason: "DUPLICATE_PENDING" }),
    );

    await expect(
      shiftAdjustmentsApi.create({ kind: "extend", requestedEndTime: "18:00", reason: "abc" }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT", reason: "DUPLICATE_PENDING" });
  });
});

describe("shiftAdjustmentsApi.list", () => {
  it("unwraps {requests} and builds the status param", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { requests: [ROW] }));

    const rows = await shiftAdjustmentsApi.list("pending");

    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/shift-adjustments?status=pending",
      undefined,
    );
    expect(rows).toEqual([ROW]);
  });

  it("omits the status param when unfiltered", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { requests: [] }));

    await shiftAdjustmentsApi.list();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shift-adjustments", undefined);
  });
});

describe("shiftAdjustmentsApi.cancel", () => {
  it("POSTs to /:id/cancel with the id path-encoded (CWE-29 idiom)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ...ROW, status: "cancelled" }));

    await shiftAdjustmentsApi.cancel("a/b?c");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-adjustments/a%2Fb%3Fc/cancel");
    expect(init.method).toBe("POST");
  });

  it("surfaces NOT_OWNER / ALREADY_DECIDED as coded errors", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "FORBIDDEN", reason: "NOT_OWNER" }),
    );

    await expect(shiftAdjustmentsApi.cancel("adj-1")).rejects.toMatchObject({
      status: 403,
      reason: "NOT_OWNER",
    });
  });
});

describe("isValidAdjustmentTime (server TIME_RE mirror)", () => {
  it("accepts the server's H:MM / HH:MM / HH:MM:SS forms", () => {
    expect(isValidAdjustmentTime("18:00")).toBe(true);
    expect(isValidAdjustmentTime("7:30")).toBe(true);
    expect(isValidAdjustmentTime("07:30:15")).toBe(true);
    expect(isValidAdjustmentTime("23:59")).toBe(true);
    expect(isValidAdjustmentTime("00:00")).toBe(true);
    expect(isValidAdjustmentTime(" 18:00 ")).toBe(true); // server trims first
  });

  it("rejects what the server's INVALID_TIME rejects", () => {
    expect(isValidAdjustmentTime("24:00")).toBe(false);
    expect(isValidAdjustmentTime("18:60")).toBe(false);
    expect(isValidAdjustmentTime("18:5")).toBe(false);
    expect(isValidAdjustmentTime("1800")).toBe(false);
    expect(isValidAdjustmentTime("")).toBe(false);
    expect(isValidAdjustmentTime("late")).toBe(false);
  });
});

describe("validateAdjustmentRequest (server order: kind → time → reason → direction)", () => {
  const WINDOW = { startTime: "08:00", endTime: "16:00" };

  it("passes a well-formed extend", () => {
    expect(
      validateAdjustmentRequest(
        { kind: "extend", requestedEndTime: "18:00", reason: "abc" },
        WINDOW,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an unknown kind first (INVALID_KIND)", () => {
    expect(
      validateAdjustmentRequest(
        { kind: "type-was-wrong", requestedEndTime: "not-a-time", reason: "" },
        WINDOW,
      ),
    ).toEqual({ ok: false, reason: "INVALID_KIND" });
  });

  it("rejects a malformed time before the reason (INVALID_TIME)", () => {
    expect(
      validateAdjustmentRequest({ kind: "extend", requestedEndTime: "24:00", reason: "" }, WINDOW),
    ).toEqual({ ok: false, reason: "INVALID_TIME" });
  });

  it("mirrors the 3–500 reason bounds (INVALID_REASON)", () => {
    expect(
      validateAdjustmentRequest({ kind: "extend", requestedEndTime: "18:00", reason: "ab" }, WINDOW),
    ).toEqual({ ok: false, reason: "INVALID_REASON" });
    expect(
      validateAdjustmentRequest(
        { kind: "extend", requestedEndTime: "18:00", reason: "x".repeat(REASON_MAX_LENGTH + 1) },
        WINDOW,
      ),
    ).toEqual({ ok: false, reason: "INVALID_REASON" });
    expect(
      validateAdjustmentRequest(
        { kind: "extend", requestedEndTime: "18:00", reason: "x".repeat(REASON_MIN_LENGTH) },
        WINDOW,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a non-later extend and a non-earlier leave (direction mirror)", () => {
    expect(
      validateAdjustmentRequest({ kind: "extend", requestedEndTime: "16:00", reason: "abc" }, WINDOW),
    ).toEqual({ ok: false, reason: "NOT_AN_EXTENSION" });
    expect(
      validateAdjustmentRequest(
        { kind: "leave_early", requestedEndTime: "16:00", reason: "abc" },
        WINDOW,
      ),
    ).toEqual({ ok: false, reason: "NOT_EARLIER" });
    expect(
      validateAdjustmentRequest(
        { kind: "leave_early", requestedEndTime: "14:30", reason: "abc" },
        WINDOW,
      ),
    ).toEqual({ ok: true });
  });

  it("is overnight-aware: an end past midnight still extends a night shift", () => {
    const night = { startTime: "20:00", endTime: "04:00" };
    // 06:00 is numerically before 20:00 but lands on the next day → later.
    expect(
      validateAdjustmentRequest(
        { kind: "extend", requestedEndTime: "06:00", reason: "abc" },
        night,
      ),
    ).toEqual({ ok: true });
    // 02:00 next-day is EARLIER than the 04:00 next-day end → not an extension.
    expect(
      validateAdjustmentRequest(
        { kind: "extend", requestedEndTime: "02:00", reason: "abc" },
        night,
      ),
    ).toEqual({ ok: false, reason: "NOT_AN_EXTENSION" });
  });

  it("validates field shapes only when no window is provided", () => {
    expect(
      validateAdjustmentRequest({ kind: "extend", requestedEndTime: "16:00", reason: "abc" }),
    ).toEqual({ ok: true });
  });
});

describe("realtime invalidation vocabulary", () => {
  it("locks the four verified shift-adjustment audit actionTypes", () => {
    expect([...SHIFT_ADJUSTMENT_AUDIT_ACTION_TYPES].sort()).toEqual([
      "shift_adjustment_approved",
      "shift_adjustment_cancelled",
      "shift_adjustment_rejected",
      "shift_adjustment_requested",
    ]);
  });
});
