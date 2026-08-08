/**
 * Shape tests for the docking / room-sweep API module (Slice 7). `authFetch`
 * (+ expo-crypto) mocked to lock: path building + id encoding, the sweep
 * commit body + x-request-id tracing header (NOT an Idempotency-Key — these
 * routes aren't idempotency-scoped), the bulk-verify body, and the
 * INSUFFICIENT_ROLE reason mapping used to gate the technician+ bulk-verify.
 */
import {
  dockingApi,
  dockingKeys,
  isInsufficientRoleError,
} from "../api/docking";
import { ApiCodedError } from "../api/coded-error";

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

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("dockingKeys", () => {
  it("nests the sweep key under the canonical root", () => {
    expect(dockingKeys.all).toEqual(["docking"]);
    expect(dockingKeys.sweep("room-1")).toEqual(["docking", "sweep", "room-1"]);
  });
});

describe("dockingApi.getSweep", () => {
  it("GETs the encoded sweep path and unwraps {roomId, items}", async () => {
    const worklist = { roomId: "room-1", items: [] };
    mockAuthFetch.mockResolvedValue(makeResponse(200, worklist));
    const result = await dockingApi.getSweep("room-1");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/docking/rooms/room-1/sweep", undefined);
    expect(result).toEqual(worklist);
  });

  it("encodes the roomId into the path", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { roomId: "x", items: [] }));
    await dockingApi.getSweep("a/b");
    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/docking/rooms/a%2Fb/sweep");
  });
});

describe("dockingApi.commitSweep", () => {
  it("POSTs the confirmed ids with an x-request-id header (no Idempotency-Key)", async () => {
    const result = {
      roomId: "room-1",
      confirmedCount: 2,
      missingCount: 1,
      skippedNoStationCount: 0,
      sweptById: "user-1",
      sweptAt: "2026-08-08T06:00:00.000Z",
    };
    mockAuthFetch.mockResolvedValue(makeResponse(200, result));

    const out = await dockingApi.commitSweep("room-1", ["eq-1", "eq-2"]);

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/docking/rooms/room-1/sweep");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ confirmedEquipmentIds: ["eq-1", "eq-2"] });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-request-id"]).toBe("test-request-uuid");
    expect(headers["Idempotency-Key"]).toBeUndefined();
    expect(out).toEqual(result);
  });
});

describe("dockingApi.bulkVerifyRoom", () => {
  it("POSTs {roomId} to the equipment bulk-verify path", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, { affected: 3, skipped: [], roomName: "Recovery" }),
    );
    const out = await dockingApi.bulkVerifyRoom("room-1");
    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/equipment/bulk-verify-room");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ roomId: "room-1" });
    expect(out.affected).toBe(3);
  });
});

describe("dockingApi.notFoundHere", () => {
  it("POSTs to the encoded not-found-here path and returns {ok}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { ok: true }));
    const out = await dockingApi.notFoundHere("eq/1");
    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/docking/equipment/eq%2F1/not-found-here");
    expect(init.method).toBe("POST");
    expect(out).toEqual({ ok: true });
  });
});

describe("isInsufficientRoleError", () => {
  it("maps ONLY a 403 with reason INSUFFICIENT_ROLE (the server ACCESS_DENIED envelope)", () => {
    expect(isInsufficientRoleError(new ApiCodedError(403, "ACCESS_DENIED", "INSUFFICIENT_ROLE"))).toBe(
      true,
    );
    // The generic code is ACCESS_DENIED — matching on code alone would miss it.
    expect(isInsufficientRoleError(new ApiCodedError(403, "ACCESS_DENIED", "TENANT_MISMATCH"))).toBe(
      false,
    );
    expect(isInsufficientRoleError(new ApiCodedError(401, "ACCESS_DENIED", "INSUFFICIENT_ROLE"))).toBe(
      false,
    );
    expect(isInsufficientRoleError(new Error("INSUFFICIENT_ROLE"))).toBe(false);
    expect(isInsufficientRoleError(null)).toBe(false);
  });

  it("maps the real requestJson-normalized 403 through bulkVerifyRoom", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "ACCESS_DENIED", error: "ACCESS_DENIED", reason: "INSUFFICIENT_ROLE" }),
    );
    await dockingApi.bulkVerifyRoom("room-1").catch((err: unknown) => {
      expect(isInsufficientRoleError(err)).toBe(true);
    });
    expect.assertions(1);
  });
});
