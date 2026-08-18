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

  it("degrades a missing/!Array `managers` field to an empty list, never throws", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, {}));
    await expect(api.users.managers()).resolves.toEqual([]);
  });

  it("surfaces the server's coded 500 as an ApiCodedError (no silent empty list)", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(500, { code: "INTERNAL_ERROR", reason: "USERS_MANAGERS_FAILED" }),
    );
    await expect(api.users.managers()).rejects.toBeInstanceOf(ApiCodedError);
  });
});
