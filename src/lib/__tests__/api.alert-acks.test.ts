/**
 * Shape tests for the alert-acks module (Slice 6). Verifies the method / path /
 * body / idempotency-header contract against the server routes, the
 * includeResolved read, coded-error propagation, and the audit-actionType vocab.
 */
import {
  alertAckKeys,
  ALERT_ACK_AUDIT_ACTION_TYPES,
  alertAcksApi,
} from "../api/alert-acks";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-request-id" }));

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

const ackRow = {
  id: "ack-1",
  equipmentId: "eq-1",
  alertType: "issue",
  ackStatus: "SEEN" as const,
  acknowledgedByDisplayName: "Dr Vet",
  acknowledgedAt: "2026-08-08T08:00:00.000Z",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("alertAckKeys", () => {
  it("nests the list key under the canonical root", () => {
    expect(alertAckKeys.all).toEqual(["alert-acks"]);
    expect(alertAckKeys.list()).toEqual(["alert-acks", "list"]);
  });
});

describe("ALERT_ACK_AUDIT_ACTION_TYPES", () => {
  it("are exactly the two verified audit actionTypes", () => {
    expect(ALERT_ACK_AUDIT_ACTION_TYPES).toEqual(["alert_seen", "alert_resolved"]);
  });
});

describe("alertAcksApi.list", () => {
  it("GETs the includeResolved list and returns the bare array", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, [ackRow]));

    const rows = await alertAcksApi.list();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/alert-acks?includeResolved=true", undefined);
    expect(rows).toEqual([ackRow]);
  });
});

describe("alertAcksApi.acknowledge", () => {
  it("POSTs {equipmentId, alertType} with the x-request-id header", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(201, ackRow));

    const row = await alertAcksApi.acknowledge("eq-1", "issue");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/alert-acks", {
      method: "POST",
      body: JSON.stringify({ equipmentId: "eq-1", alertType: "issue" }),
      headers: { "x-request-id": "test-request-id" },
    });
    expect(row).toEqual(ackRow);
  });

  it("surfaces a coded 403 (off-shift senior) as ApiCodedError", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "INSUFFICIENT_ROLE", reason: "ROLE_TOO_LOW" }),
    );

    await expect(alertAcksApi.acknowledge("eq-1", "issue")).rejects.toMatchObject({
      status: 403,
      code: "INSUFFICIENT_ROLE",
      reason: "ROLE_TOO_LOW",
    });
  });
});

describe("alertAcksApi.resolve", () => {
  it("PATCHes /:id/resolve with the note when provided (id encoded)", async () => {
    const resolved = { ...ackRow, ackStatus: "RESOLVED" as const, resolutionNote: "swapped part" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, resolved));

    const row = await alertAcksApi.resolve("ack/1", "swapped part");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/alert-acks/ack%2F1/resolve", {
      method: "PATCH",
      body: JSON.stringify({ resolutionNote: "swapped part" }),
      headers: { "x-request-id": "test-request-id" },
    });
    expect(row).toEqual(resolved);
  });

  it("PATCHes an empty body when no note is given", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ...ackRow, ackStatus: "RESOLVED" }));

    await alertAcksApi.resolve("ack-1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/alert-acks/ack-1/resolve", {
      method: "PATCH",
      body: "{}",
      headers: { "x-request-id": "test-request-id" },
    });
  });

  it("throws a coded error on a 500", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(500, { code: "INTERNAL_ERROR", reason: "ALERT_RESOLVE_FAILED" }),
    );

    await expect(alertAcksApi.resolve("ack-1")).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
    });
  });
});
