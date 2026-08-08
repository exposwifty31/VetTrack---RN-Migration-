/**
 * Shape + validation tests for the account API module (Slice 12). Verified
 * server contract: PATCH /api/users/:id/display_name {display_name} (trim,1–60),
 * self-or-admin → 403 {code:"FORBIDDEN"} otherwise, 404 {code:"NOT_FOUND"} for a
 * stale id; success returns the full updated row (we model {id, displayName}).
 */
import {
  accountApi,
  DISPLAY_NAME_MAX_LENGTH,
  isValidDisplayName,
} from "../api/account";
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

describe("isValidDisplayName", () => {
  it("accepts 1..60 chars after trimming", () => {
    expect(isValidDisplayName("A")).toBe(true);
    expect(isValidDisplayName("  Dana Levi  ")).toBe(true);
    expect(isValidDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH))).toBe(true);
  });

  it("rejects empty/whitespace-only and over-length names", () => {
    expect(isValidDisplayName("")).toBe(false);
    expect(isValidDisplayName("   ")).toBe(false);
    expect(isValidDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("accountApi.updateDisplayName", () => {
  it("PATCHes /:id/display_name with the trimmed name, path-encoded id, and a trace id", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { id: "u/1", displayName: "Dana Levi" }));

    const result = await accountApi.updateDisplayName("u/1", "  Dana Levi  ");

    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/users/u%2F1/display_name");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ display_name: "Dana Levi" });
    expect((init.headers as Record<string, string>)["x-request-id"]).toBe("test-request-uuid");
    expect(result).toEqual({ id: "u/1", displayName: "Dana Levi" });
  });

  it("surfaces a 403 self-or-admin denial as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "FORBIDDEN", reason: "INSUFFICIENT_ROLE" }),
    );

    const err = await accountApi.updateDisplayName("other", "Name").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiCodedError);
    expect(err).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("surfaces a 404 stale-id as a coded error", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(404, { code: "NOT_FOUND" }));

    const err = await accountApi.updateDisplayName("gone", "Name").catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
