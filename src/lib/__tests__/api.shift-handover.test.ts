/**
 * Shape + coded-error tests for the shift-handover module (Slice 9). Verified
 * server contract: GET /current → {handover: Artifact | null}; POST/DELETE
 * /:id/acknowledge → {handover: Artifact}. All plain requireAuth; the two
 * mutations are roster-authorized → 403 {code:"errors.authority.denied"}, which
 * `isHandoverForbiddenError` recognises (and a 404 / non-coded error does not).
 */
import {
  isHandoverForbiddenError,
  shiftHandoverApi,
  shiftHandoverKeys,
  type HandoverArtifact,
} from "../api/shift-handover";

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

const UNACKED: HandoverArtifact = {
  id: "hand-1",
  shiftSessionId: "sess-1",
  revision: 2,
  deltas: {
    custody: [
      { sourceId: "a1", kind: "equipment_checked_out", targetId: "eq-1", targetType: "equipment", at: "2026-08-08T07:00:00.000Z" },
    ],
    taskState: [],
    alerts: [],
    dispenses: [],
  },
  openItems: [{ id: "oi-1", kind: "alert", summary: "אלת החייאה פתוחה בחדר 3" }],
  observedSignals: [{ sourceId: "s1", kind: "scan", at: "2026-08-08T07:05:00.000Z" }],
  patientWorklist: {
    state: "ready",
    entries: [{ externalId: "PMS-42", display: "Rex", byTechId: "u-1" }],
  },
  acknowledgedBy: null,
  acknowledgedAt: null,
  notificationReadAt: null,
  generatedAt: "2026-08-08T06:00:00.000Z",
  staff: [{ userId: "u-1", name: "Dana Levi" }],
};

const ACKED: HandoverArtifact = {
  ...UNACKED,
  acknowledgedBy: "u-1",
  acknowledgedAt: "2026-08-08T08:00:00.000Z",
  notificationReadAt: "2026-08-08T08:00:00.000Z",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("shiftHandoverKeys", () => {
  it("nests the current key under the canonical root", () => {
    expect(shiftHandoverKeys.all).toEqual(["shiftHandover"]);
    expect(shiftHandoverKeys.current()).toEqual(["shiftHandover", "current"]);
  });
});

describe("shiftHandoverApi.getCurrent", () => {
  it("GETs /current and unwraps the artifact", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { handover: UNACKED }));

    const result = await shiftHandoverApi.getCurrent();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/shift-handover/current", undefined);
    expect(result).toEqual(UNACKED);
  });

  it("returns null when no handover has been generated", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { handover: null }));

    expect(await shiftHandoverApi.getCurrent()).toBeNull();
  });
});

describe("shiftHandoverApi.acknowledge", () => {
  it("POSTs to /:id/acknowledge (id path-encoded) with a trace id and unwraps the acked row", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { handover: ACKED }));

    const result = await shiftHandoverApi.acknowledge("a/b?c");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-handover/a%2Fb%3Fc/acknowledge");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-request-id"]).toBe("test-request-uuid");
    expect(result).toEqual(ACKED);
    expect(result.acknowledgedAt).not.toBeNull();
  });
});

describe("shiftHandoverApi.unconfirm", () => {
  it("DELETEs /:id/acknowledge (id path-encoded) and unwraps the cleared row", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { handover: UNACKED }));

    const result = await shiftHandoverApi.unconfirm("hand-1");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/shift-handover/hand-1/acknowledge");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual(UNACKED);
    expect(result.acknowledgedAt).toBeNull();
  });
});

describe("coded-error surfacing + isHandoverForbiddenError", () => {
  it("maps a roster 403 to a forbidden error carrying errors.authority.denied", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { error: "אין הרשאה", code: "errors.authority.denied" }),
    );

    const err = await shiftHandoverApi.acknowledge("hand-1").catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 403, code: "errors.authority.denied" });
    expect(isHandoverForbiddenError(err)).toBe(true);
  });

  it("does not treat a 404 not-found as forbidden", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(404, { code: "errors.notFound" }));

    const err = await shiftHandoverApi.unconfirm("stale-id").catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 404, code: "errors.notFound" });
    expect(isHandoverForbiddenError(err)).toBe(false);
  });

  it("does not treat a non-coded error as forbidden", () => {
    expect(isHandoverForbiddenError(new Error("network down"))).toBe(false);
    expect(isHandoverForbiddenError(null)).toBe(false);
  });
});
