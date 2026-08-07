/**
 * Shape test for the Slice-4 personal custody endpoint — GET /api/equipment/my
 * returns a BARE array (no page envelope), and its query key nests under the
 * canonical ["equipment"] prefix so global equipment invalidation covers it.
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

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("api.equipment.my", () => {
  it("GETs /api/equipment/my and returns the bare array unchanged", async () => {
    const items = [
      {
        id: "eq1",
        name: "Infusion pump",
        status: "ok",
        custodyState: "checked_out",
        checkedOutAt: "2026-08-07T08:00:00.000Z",
        folderName: "ICU",
        roomName: "Room 2",
        lastVerifiedByName: "Dana",
      },
    ];
    mockAuthFetch.mockResolvedValue(makeResponse(200, items));

    const result = await api.equipment.my();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/equipment/my", undefined);
    expect(result).toEqual(items);
  });

  it("returns an empty array untouched (the honest no-custody state)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, []));
    await expect(api.equipment.my()).resolves.toEqual([]);
  });

  it("throws the server error message on a non-ok response (requestJson contract)", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, { error: "Failed to fetch my equipment" }));
    await expect(api.equipment.my()).rejects.toThrow("Failed to fetch my equipment");
  });
});

describe("equipmentKeys.my", () => {
  it("nests under equipmentKeys.all so global equipment invalidation covers it", () => {
    expect(equipmentKeys.my()).toEqual(["equipment", "my"]);
    expect(equipmentKeys.my().slice(0, equipmentKeys.all.length)).toEqual([...equipmentKeys.all]);
  });
});
