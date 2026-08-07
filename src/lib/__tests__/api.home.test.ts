/**
 * Shape tests for the home daily-pulse API module (Slice 5). `authFetch` is
 * mocked with crafted Responses to lock: the dashboard passthrough (incl. the
 * server's startedAt/startsAt field asymmetry), cursor-param building on the
 * activity feed, the {items, nextCursor} page envelope, my-scan-count
 * unwrapping, and the verified audit-actionType invalidation vocabulary.
 */
import { ApiCodedError } from "../api/coded-error";
import { ACTIVITY_AUDIT_ACTION_TYPES, homeApi, homeKeys } from "../api/home";

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

const DASHBOARD = {
  shift: { startedAt: "2026-08-07T05:00:00.000Z", endsAt: "2026-08-07T13:00:00.000Z", role: "technician" },
  nextShift: null,
  streak: 4,
  tasksCompletedToday: 6,
  scansToday: 11,
};

const SCAN_ITEM = {
  id: "log-1",
  type: "scan" as const,
  equipmentId: "eq-1",
  equipmentName: "Vitals Monitor 3",
  status: "ok",
  note: null,
  userId: "user-1",
  userEmail: "tech@example.com",
  timestamp: "2026-08-07T09:30:00.000Z",
};

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("homeKeys", () => {
  it("nests every key under the canonical root", () => {
    expect(homeKeys.all).toEqual(["home"]);
    expect(homeKeys.dashboard()).toEqual(["home", "dashboard"]);
    expect(homeKeys.activity()).toEqual(["home", "activity"]);
    expect(homeKeys.myScanCount()).toEqual(["home", "myScanCount"]);
  });
});

describe("homeApi.getDashboard", () => {
  it("returns the payload verbatim (startedAt on shift, startsAt on nextShift)", async () => {
    const withNext = {
      ...DASHBOARD,
      shift: null,
      nextShift: { startsAt: "2026-08-08T05:00:00.000Z", endsAt: "2026-08-08T13:00:00.000Z", role: "technician" },
    };
    mockAuthFetch.mockResolvedValue(makeResponse(200, withNext));

    const dashboard = await homeApi.getDashboard();

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/home/dashboard", undefined);
    expect(dashboard.nextShift?.startsAt).toBe("2026-08-08T05:00:00.000Z");
    expect(dashboard.shift).toBeNull();
  });

  it("throws a coded error on a non-OK response", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, { code: "INTERNAL_ERROR" }));

    await expect(homeApi.getDashboard()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      name: "ApiCodedError",
    });
  });
});

describe("homeApi.listActivity", () => {
  it("fetches the newest page without a cursor param when cursor is null", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { items: [SCAN_ITEM], nextCursor: null }));

    const page = await homeApi.listActivity(null);

    expect(mockAuthFetch).toHaveBeenCalledWith("/api/activity", undefined);
    expect(page.items).toEqual([SCAN_ITEM]);
    expect(page.nextCursor).toBeNull();
  });

  it("URL-encodes the ISO cursor into ?cursor=", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { items: [], nextCursor: null }));

    await homeApi.listActivity("2026-08-07T09:30:00.000Z");

    const [path] = mockAuthFetch.mock.calls[0] as [string];
    expect(path).toBe("/api/activity?cursor=2026-08-07T09%3A30%3A00.000Z");
  });

  it("surfaces the server's INVALID_CURSOR rejection as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(400, { code: "VALIDATION_FAILED", reason: "INVALID_CURSOR" }),
    );

    await expect(homeApi.listActivity("not-a-date")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      reason: "INVALID_CURSOR",
    });
  });

  it("passes nextCursor through for the next page request", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, { items: [SCAN_ITEM], nextCursor: SCAN_ITEM.timestamp }),
    );

    const page = await homeApi.listActivity(null);
    expect(page.nextCursor).toBe("2026-08-07T09:30:00.000Z");
  });
});

describe("homeApi.getMyScanCount", () => {
  it("unwraps {count}", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { count: 42 }));

    await expect(homeApi.getMyScanCount()).resolves.toBe(42);
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/activity/my-scan-count", undefined);
  });
});

describe("coded-error normalization (shared requestJson)", () => {
  it("survives a JSON null error body — coded error, never a TypeError", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403, null));

    await expect(homeApi.getDashboard()).rejects.toMatchObject({
      status: 403,
      code: "HTTP_403",
      name: "ApiCodedError",
    });
  });

  it("falls back to the error field when code is missing", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, { error: "INTERNAL_ERROR" }));

    await expect(homeApi.getDashboard()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("exposes reason for coded branching", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "CONFLICT", reason: "NOT_ON_SHIFT" }),
    );

    const error = await homeApi.getDashboard().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiCodedError);
    expect((error as ApiCodedError).reason).toBe("NOT_ON_SHIFT");
  });
});

describe("realtime invalidation vocabulary", () => {
  it("locks the verified scan/transfer-writer audit actionTypes", () => {
    // Verified 2026-08-07 against every server-side scan_logs/transfer_logs
    // writer (equipment.ts scan route, custody-toggle service, bulk move/
    // delete/verify handlers, patch-equipment folder move).
    expect([...ACTIVITY_AUDIT_ACTION_TYPES].sort()).toEqual([
      "equipment_bulk_deleted",
      "equipment_bulk_moved",
      "equipment_checked_out",
      "equipment_returned",
      "equipment_scanned",
      "equipment_updated",
      "room_bulk_verified",
    ]);
  });
});
