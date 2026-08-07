/**
 * Shape tests for the Slice-2 equipment-detail endpoints. `authFetch` is mocked
 * to crafted Responses so we assert path building (incl. CWE-29 id encoding),
 * HTTP method, the x-request-id idempotency header on every custody mutation,
 * and the response envelope each wrapper returns.
 */
import { api, equipmentKeys } from "../api";

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
    headers: { get: () => null },
  } as unknown as Response;
}

/** An id with every CWE-29 hazard: slash, query, fragment, dot segment. */
const HOSTILE_ID = "eq/../1?x=1#frag";
const ENCODED_ID = encodeURIComponent(HOSTILE_ID);

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("api.equipment detail reads", () => {
  it("byId GETs the encoded id path and returns the detail body", async () => {
    const detail = { id: "eq1", name: "Ultrasound", status: "ok" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, detail));

    const result = await api.equipment.byId(HOSTILE_ID);

    expect(mockAuthFetch).toHaveBeenCalledWith(`/api/equipment/${ENCODED_ID}`, undefined);
    expect(result).toEqual(detail);
  });

  it("logs builds page/limit params and returns the page envelope", async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 20, hasMore: false };
    mockAuthFetch.mockResolvedValue(makeResponse(200, page));

    const result = await api.equipment.logs("eq1", 2, 20);

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/logs?page=2&limit=20", undefined);
    expect(result).toEqual(page);
  });

  it("logs defaults to page 1 / limit 20", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, { items: [], total: 0, page: 1, pageSize: 20, hasMore: false }),
    );

    await api.equipment.logs("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/logs?page=1&limit=20", undefined);
  });

  it("transfers GETs the bare array", async () => {
    const transfers = [{ id: "t1", timestamp: "2026-08-01T00:00:00Z" }];
    mockAuthFetch.mockResolvedValue(makeResponse(200, transfers));

    const result = await api.equipment.transfers(HOSTILE_ID);

    expect(mockAuthFetch).toHaveBeenCalledWith(`/api/equipment/${ENCODED_ID}/transfers`, undefined);
    expect(result).toEqual(transfers);
  });

  it("deployability GETs the operational-state route", async () => {
    const body = {
      equipmentId: "eq1",
      custodyState: "available",
      readinessState: "ready",
      usageState: "available",
      fullDeployable: true,
      bundleGate: { ok: true },
      asOfMs: 1,
    };
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));

    const result = await api.equipment.deployability("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/deployability", undefined);
    expect(result.fullDeployable).toBe(true);
  });

  it("truth GETs the evidence-graph route", async () => {
    const body = { equipmentId: "eq1", citations: [] };
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));

    await api.equipment.truth(HOSTILE_ID);

    expect(mockAuthFetch).toHaveBeenCalledWith(`/api/equipment/${ENCODED_ID}/truth`, undefined);
  });

  it("throws on a non-ok read (requestJson contract)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(404, { error: "Equipment not found" }));

    await expect(api.equipment.byId("missing")).rejects.toThrow("Equipment not found");
  });
});

describe("api.equipment waitlist", () => {
  const snapshot = {
    equipmentId: "eq1",
    queueSize: 1,
    myPosition: 1,
    myStatus: "waiting",
    reservationExpiresAt: null,
    notifiedUserId: null,
    entries: [],
  };

  it("waitlist GETs the snapshot", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, snapshot));

    const result = await api.equipment.waitlist("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/waitlist", undefined);
    expect(result.queueSize).toBe(1);
  });

  it("joinWaitlist POSTs and returns the fresh snapshot (201)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(201, snapshot));

    const result = await api.equipment.joinWaitlist("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/waitlist", { method: "POST" });
    expect(result.myPosition).toBe(1);
  });

  it("leaveWaitlist DELETEs and returns the fresh snapshot", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ...snapshot, queueSize: 0, myPosition: null }));

    const result = await api.equipment.leaveWaitlist("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/waitlist", { method: "DELETE" });
    expect(result.myPosition).toBeNull();
  });

  it("join surfaces the server rejection as a thrown error", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409, { error: "already joined" }));

    await expect(api.equipment.joinWaitlist("eq1")).rejects.toThrow("already joined");
  });
});

describe("api.equipment custody mutations", () => {
  it("checkout POSTs the body with the x-request-id idempotency header", async () => {
    const body = { equipment: { id: "eq1" }, undoToken: "u1" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));

    const result = await api.equipment.checkout(HOSTILE_ID, { location: "OR-2" });

    expect(mockAuthFetch).toHaveBeenCalledWith(`/api/equipment/${ENCODED_ID}/checkout`, {
      method: "POST",
      body: JSON.stringify({ location: "OR-2" }),
      headers: { "x-request-id": "test-request-id" },
    });
    expect(result.undoToken).toBe("u1");
  });

  it("returnEquipment POSTs isPluggedIn + header and returns the return envelope", async () => {
    const body = { equipment: { id: "eq1" }, undoToken: "u2", returnRecord: null };
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));

    const result = await api.equipment.returnEquipment("eq1", { isPluggedIn: false });

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/return", {
      method: "POST",
      body: JSON.stringify({ isPluggedIn: false }),
      headers: { "x-request-id": "test-request-id" },
    });
    expect(result.returnRecord).toBeNull();
  });

  it("returnEquipment defaults to an empty JSON body (schema is .strict, all-optional)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, { equipment: { id: "eq1" }, undoToken: "", returnRecord: null }),
    );

    await api.equipment.returnEquipment("eq1");

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/return", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "x-request-id": "test-request-id" },
    });
  });

  it("reportStatus POSTs the status enum + note with the idempotency header", async () => {
    const body = { equipment: { id: "eq1" }, scanLog: { id: "log1" }, undoToken: "u3" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));

    const result = await api.equipment.reportStatus("eq1", { status: "issue", note: "cracked probe" });

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/eq1/scan", {
      method: "POST",
      body: JSON.stringify({ status: "issue", note: "cracked probe" }),
      headers: { "x-request-id": "test-request-id" },
    });
    expect(result.undoToken).toBe("u3");
  });

  it("custody mutation failures throw loud (never queued)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(409, { error: "Already checked out" }));

    await expect(api.equipment.checkout("eq1")).rejects.toThrow("Already checked out");
  });
});

describe("equipmentKeys detail sub-keys", () => {
  it("nests every detail sub-resource under detail(id) so equipmentKeys.all covers them", () => {
    expect(equipmentKeys.logs("e1")).toEqual(["equipment", "detail", "e1", "logs"]);
    expect(equipmentKeys.transfers("e1")).toEqual(["equipment", "detail", "e1", "transfers"]);
    expect(equipmentKeys.waitlist("e1")).toEqual(["equipment", "detail", "e1", "waitlist"]);
    expect(equipmentKeys.deployability("e1")).toEqual(["equipment", "detail", "e1", "deployability"]);
    expect(equipmentKeys.truth("e1")).toEqual(["equipment", "detail", "e1", "truth"]);
  });
});
