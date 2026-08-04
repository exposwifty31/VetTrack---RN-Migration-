/**
 * Shape tests for the bespoke, non-throwing equipment wrappers. `authFetch` is
 * mocked to return crafted Responses so we can assert the status→variant mapping
 * without a real JWT / userId / API origin — and, critically, that a bodiless 304
 * never calls `res.json()`.
 */
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-request-id" }));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

import { api } from "../api";

type FakeResponseInit = {
  status: number;
  ok?: boolean;
  body?: unknown;
  etag?: string;
};

function makeResponse({ status, ok, body, etag }: FakeResponseInit) {
  const json = jest.fn(async () => body);
  return {
    response: {
      ok: ok ?? (status >= 200 && status < 300),
      status,
      json,
      headers: { get: (name: string) => (name === "ETag" ? (etag ?? null) : null) },
    } as unknown as Response,
    json,
  };
}

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("api.equipment.scan", () => {
  it("maps 200 to a ScanSuccess variant", async () => {
    const { response } = makeResponse({
      status: 200,
      body: {
        equipment: { id: "eq1", name: "Ultrasound", status: "in_use", custodyState: "checked_out", version: 2 },
        action: "checkout",
        scanLogId: "log_1",
        undoToken: "undo_1",
      },
    });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.scan("eq1");

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.action).toBe("checkout");
      expect(result.equipment.id).toBe("eq1");
      expect(result.undoToken).toBe("undo_1");
    }
    // Idempotency header is attached.
    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/equipment/scan",
      expect.objectContaining({ method: "POST", headers: { "x-request-id": "test-request-id" } }),
    );
  });

  it("maps a 409 custody conflict to ConflictResult with the holder email (flat sibling)", async () => {
    const { response } = makeResponse({
      status: 409,
      body: {
        code: "CONFLICT",
        error: "CONFLICT",
        reason: "EQUIPMENT_ALREADY_CHECKED_OUT",
        message: "held",
        checkedOutByEmail: "vet@clinic.test",
      },
    });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.scan("eq1");

    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.reason).toBe("EQUIPMENT_ALREADY_CHECKED_OUT");
      expect(result.checkedOutByEmail).toBe("vet@clinic.test");
    }
  });

  it("maps 404 to not_found", async () => {
    const { response } = makeResponse({ status: 404, body: { reason: "EQUIPMENT_NOT_FOUND" } });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.scan("nope");
    expect(result.kind).toBe("not_found");
  });

  it("maps a non-custody 409 (staging gate) to blocked_precondition", async () => {
    const { response } = makeResponse({
      status: 409,
      body: { code: "STAGING_CONFLICT", reason: "STAGING_CONFLICT", message: "staged" },
    });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.scan("eq1");
    expect(result.kind).toBe("blocked_precondition");
    if (result.kind === "blocked_precondition") {
      expect(result.code).toBe("STAGING_CONFLICT");
    }
  });

  it("maps a 422 gate error to blocked_precondition", async () => {
    const { response } = makeResponse({
      status: 422,
      body: { code: "EQUIPMENT_UNAVAILABLE", message: "unavailable" },
    });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.scan("eq1");
    expect(result.kind).toBe("blocked_precondition");
  });
});

describe("api.equipment.list", () => {
  it("returns a 200 page with the ETag", async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 20, hasMore: false };
    const { response } = makeResponse({ status: 200, body: page, etag: 'W/"abc"' });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.list();
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.etag).toBe('W/"abc"');
      expect(result.data).toEqual(page);
    }
  });

  it("treats a 304 as a cache-hit WITHOUT calling res.json()", async () => {
    const { response, json } = makeResponse({ status: 304 });
    mockAuthFetch.mockResolvedValue(response);

    const result = await api.equipment.list(undefined, 'W/"abc"');
    expect(result.status).toBe(304);
    expect(json).not.toHaveBeenCalled();
    // The conditional request carried the ETag.
    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/equipment",
      expect.objectContaining({ headers: { "If-None-Match": 'W/"abc"' } }),
    );
  });
});
