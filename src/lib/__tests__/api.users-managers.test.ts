/**
 * Shape test for `api.users.managers()` — the Code Blue manager picker's list
 * source (GET /api/users/managers, server/routes/users.ts:1186).
 *
 * Server truth (read-only, verified 2026-08-18): `requireAuth` only — no role
 * floor beyond an authenticated, clinic-scoped user, because ANY clinical
 * initiator may need to nominate. Returns `{ managers: [...] }` filtered to
 * `role IN ('vet','admin')` + `status = 'active'` + `deleted_at IS NULL`,
 * clinic-scoped server-side, ordered by name. The wrapper unwraps `managers`.
 */
import { api } from "../api";
import { ApiCodedError } from "../api/coded-error";

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

describe("api.users.managers", () => {
  it("GETs /api/users/managers and unwraps the `managers` array", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, {
        managers: [
          { id: "u-vet", name: "Dr. Cohen", role: "vet" },
          { id: "u-admin", name: "Ops Admin", role: "admin" },
        ],
      }),
    );
    const managers = await api.users.managers();
    expect(mockAuthFetch).toHaveBeenCalledWith("/api/users/managers", undefined);
    expect(managers).toEqual([
      { id: "u-vet", name: "Dr. Cohen", role: "vet" },
      { id: "u-admin", name: "Ops Admin", role: "admin" },
    ]);
  });

  it.each([
    ["missing", {}],
    ["not an array", { managers: "nope" }],
    ["null", { managers: null }],
  ])("degrades a %s `managers` field to an empty list, never throws", async (_label, body) => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, body));
    await expect(api.users.managers()).resolves.toEqual([]);
  });

  it("DROPS an unrenderable row instead of handing it to the picker", async () => {
    // ManagerPicker calls `manager.name.trim()` and uses `manager.id` as a React
    // key. One malformed row therefore throws during render and takes down the
    // only affordance a technician has to start a Code Blue. Validate rows, not
    // just the container.
    mockAuthFetch.mockResolvedValue(
      makeResponse(200, {
        managers: [
          { id: "u-1", name: "Dr. Cohen", role: "vet" },
          { id: "u-2", name: null, role: "vet" },
          { id: "", name: "No Id", role: "vet" },
          { id: "u-3", name: "   ", role: "vet" },
          null,
          "not an object",
        ],
      }),
    );
    await expect(api.users.managers()).resolves.toEqual([
      { id: "u-1", name: "Dr. Cohen", role: "vet" },
    ]);
  });

  it("surfaces the server's coded 500 as an ApiCodedError (no silent empty list)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(500, { code: "INTERNAL_ERROR", reason: "USERS_MANAGERS_FAILED" }),
    );
    await expect(api.users.managers()).rejects.toBeInstanceOf(ApiCodedError);
  });
});
