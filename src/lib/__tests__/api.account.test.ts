/**
 * Shape + validation tests for the account API module (Slice 12). Verified
 * server contract: PATCH /api/users/:id/display_name {display_name} (trim,1–60),
 * self-or-admin → 403 {code:"FORBIDDEN"} otherwise, 404 {code:"NOT_FOUND"} for a
 * stale id; success returns the full updated row (we model {id, displayName}).
 */
import {
  ACCOUNT_DELETION_REASON,
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

/**
 * Account deletion (A8) is the in-app store-compliance path — Apple Guideline
 * 5.1.1(v) and Google Play both require it, and it is irreversible. Two things
 * therefore have to hold and neither was pinned before: the request shape stays
 * as the route documents it (no id, no body), and the coded `reason` the screen
 * branches on keeps matching the server's.
 *
 * The first is a contract assertion, NOT an authorization control — deletion is
 * scoped server-side by `req.authUser`, so a client that invented an id would
 * simply be ignored, not obeyed. What it protects is the pair staying in step:
 * the day the route starts reading an id, this fails instead of the app quietly
 * sending one the server drops.
 *
 * The second is the user-visible half. A drift there is silent — a renamed
 * reason shows a generic "try again" on a failure the user can actually act on
 * (transfer the clinic), so the assertions below match on the exported
 * constants and on `ApiCodedError`, which is the `instanceof` the screen gates
 * every mapped message behind.
 */
describe("accountApi.deleteAccount", () => {
  it("DELETEs the self-scoped route with no id, no body, and a trace id", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { success: true }));

    const result = await accountApi.deleteAccount();

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockAuthFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/users/delete-account");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["x-request-id"]).toBe("test-request-uuid");
    expect(result).toEqual({ success: true });
  });

  it("surfaces the 409 sole-clinic-admin reason the screen branches on", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "CONFLICT", reason: "SOLE_CLINIC_ADMIN" }),
    );

    const err = await accountApi.deleteAccount().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiCodedError);
    expect(err).toMatchObject({
      status: 409,
      code: "CONFLICT",
      reason: ACCOUNT_DELETION_REASON.SOLE_CLINIC_ADMIN,
    });
  });

  it("surfaces the 403 protected-account reason the screen branches on", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, { code: "FORBIDDEN", reason: "ACCOUNT_DELETION_PROTECTED" }),
    );

    const err = await accountApi.deleteAccount().catch((e: unknown) => e);

    // The screen gates the protected-account message on `instanceof
    // ApiCodedError` before it reads `reason`, so a bare object with the right
    // fields would pass this test and still render the generic copy.
    expect(err).toBeInstanceOf(ApiCodedError);
    expect(err).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      reason: ACCOUNT_DELETION_REASON.PROTECTED,
    });
  });

  it("leaves an unmapped server failure on the generic branch", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(500, { code: "INTERNAL_ERROR", reason: "ACCOUNT_DELETION_FAILED" }),
    );

    const err = await accountApi.deleteAccount().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiCodedError);
    // Neither mapped reason — the screen must fall through to the generic copy.
    expect((err as ApiCodedError).reason).not.toBe(ACCOUNT_DELETION_REASON.SOLE_CLINIC_ADMIN);
    expect((err as ApiCodedError).reason).not.toBe(ACCOUNT_DELETION_REASON.PROTECTED);
  });

  it("still raises a coded error when the failure body is not an object", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(502, null));

    const err = await accountApi.deleteAccount().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiCodedError);
    expect(err).toMatchObject({ status: 502, code: "HTTP_502", reason: null });
  });
});
