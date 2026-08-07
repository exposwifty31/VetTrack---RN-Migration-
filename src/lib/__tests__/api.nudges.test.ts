/** Shape tests for the nudges module (Slice 5, seam §6.6 pre-resolved). */
import { nudgeKeys, nudgesApi } from "../api/nudges";

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

describe("nudgeKeys", () => {
  it("nests the list key under the canonical root", () => {
    expect(nudgeKeys.all).toEqual(["nudges"]);
    expect(nudgeKeys.list()).toEqual(["nudges", "list"]);
  });
});

describe("nudgesApi.list", () => {
  it("unwraps {nudges} from GET /api/nudges", async () => {
    const nudge = {
      id: "expiry:eq-1",
      kind: "expiry" as const,
      targetRole: "technician",
      entityId: "eq-1",
      createdAt: "2026-08-07T08:00:00.000Z",
    };
    mockAuthFetch.mockResolvedValue(makeResponse(200, { nudges: [nudge] }));

    const nudges = await nudgesApi.list();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/nudges", undefined);
    expect(nudges).toEqual([nudge]);
  });

  it("throws a coded error on failure", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(500, { code: "INTERNAL_ERROR", reason: "NUDGES_COMPUTE_FAILED" }),
    );

    await expect(nudgesApi.list()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      reason: "NUDGES_COMPUTE_FAILED",
    });
  });
});
