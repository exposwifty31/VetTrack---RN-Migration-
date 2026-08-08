/**
 * Shape tests for the rooms API module (Slice 7). `authFetch` is mocked with
 * crafted Responses to lock: path building + id encoding, raw-array/object
 * unwrapping, the coded-error surface (403 ACCESS_DENIED / INSUFFICIENT_ROLE
 * carries status + reason), and the realtime invalidation vocabulary.
 */
import { ApiCodedError } from "../api/coded-error";
import {
  ROOM_AUDIT_ACTION_TYPES,
  ROOM_EVENT_TYPE_PREFIXES,
  roomKeys,
  roomsApi,
} from "../api/rooms";

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

const ROOM = {
  id: "room-1",
  name: "Recovery",
  floor: "2",
  syncStatus: "synced",
  totalEquipment: 4,
  availableCount: 3,
  inUseCount: 1,
  issueCount: 0,
  recentlyVerifiedCount: 2,
  expectedFill: 4,
  atHomeCount: 3,
  lastSweptAt: "2026-08-08T06:00:00.000Z",
  lastSweptByName: "Dana",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("roomKeys", () => {
  it("nests list/detail/activity under the canonical root", () => {
    expect(roomKeys.all).toEqual(["rooms"]);
    expect(roomKeys.list()).toEqual(["rooms", "list"]);
    expect(roomKeys.detail("room-1")).toEqual(["rooms", "detail", "room-1"]);
    expect(roomKeys.activity("room-1")).toEqual(["rooms", "activity", "room-1"]);
  });
});

describe("roomsApi.list", () => {
  it("GETs /api/rooms and returns the raw array", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, [ROOM]));
    const rooms = await roomsApi.list();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/rooms", undefined);
    expect(rooms).toEqual([ROOM]);
  });
});

describe("roomsApi.byId", () => {
  it("GETs /api/rooms/:id and returns the room object", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, ROOM));
    const room = await roomsApi.byId("room-1");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/rooms/room-1", undefined);
    expect(room).toEqual(ROOM);
  });

  it("encodes the room id into the path (CWE-29 idiom)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, ROOM));
    await roomsApi.byId("a/b?c");
    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/rooms/a%2Fb%3Fc");
  });
});

describe("roomsApi.activity", () => {
  it("GETs /api/rooms/:id/activity and returns the raw array", async () => {
    const entry = {
      id: "log-1",
      userId: "u1",
      userEmail: "tech@clinic.test",
      equipmentId: "eq-1",
      equipmentName: "Monitor",
      status: "ok",
      note: null,
      timestamp: "2026-08-08T06:00:00.000Z",
    };
    mockAuthFetch.mockResolvedValue(makeResponse(200, [entry]));
    const activity = await roomsApi.activity("room-1");
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/rooms/room-1/activity", undefined);
    expect(activity).toEqual([entry]);
  });
});

describe("coded-error surface", () => {
  it("throws an ApiCodedError carrying status + code + reason on a non-OK response", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "ACCESS_DENIED", reason: "INSUFFICIENT_ROLE" }),
    );
    await expect(roomsApi.list()).rejects.toMatchObject({
      status: 403,
      code: "ACCESS_DENIED",
      reason: "INSUFFICIENT_ROLE",
      name: "ApiCodedError",
    });
    await expect(roomsApi.list()).rejects.toBeInstanceOf(ApiCodedError);
  });

  it("survives a JSON null error body (coded, never a TypeError)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, null));
    await expect(roomsApi.byId("room-1")).rejects.toMatchObject({
      status: 500,
      code: "HTTP_500",
    });
  });
});

describe("realtime invalidation vocabulary", () => {
  it("locks the eight verified room/docking audit actionTypes", () => {
    expect([...ROOM_AUDIT_ACTION_TYPES].sort()).toEqual([
      "equipment_anchor_contradicted",
      "equipment_anchor_created",
      "equipment_home_assigned",
      "room_bulk_verified",
      "room_created",
      "room_deleted",
      "room_swept",
      "room_updated",
    ]);
  });

  it("watches the equipment broadcast prefix (custody/dock moves re-bucket counts)", () => {
    expect(ROOM_EVENT_TYPE_PREFIXES).toEqual(["EQUIPMENT_"]);
  });
});
