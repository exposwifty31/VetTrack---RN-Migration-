/**
 * W2b (H6 / single normalizer): the per-domain modules under `src/lib/api/` and
 * the root `api.ts` must share ONE `requestJson` normalizer. These pin the two
 * behaviours the collapse must preserve: a bodiless 204 resolves to `undefined`
 * (the DELETE `push.unsubscribe` path depended on `api.ts`'s local variant doing
 * this), and the envelope `reason` is surfaced (the coded-error variant's reason,
 * which `api.ts`'s variant discarded).
 */
import { ApiCodedError, requestJson } from "../coded-error";

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

function makeResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("coded-error requestJson — unified normalizer", () => {
  it("resolves to undefined on a bodiless 204 without reading the body", async () => {
    const res = makeResponse(204);
    mockAuthFetch.mockResolvedValue(res);

    await expect(
      requestJson<void>("/api/push/subscribe", { method: "DELETE" }),
    ).resolves.toBeUndefined();
    expect((res.json as jest.Mock)).not.toHaveBeenCalled();
  });

  it("surfaces the envelope reason on a coded error", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, { code: "CONFLICT", reason: "VERSION_CONFLICT", message: "stale" }),
    );

    await expect(requestJson("/api/x")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      reason: "VERSION_CONFLICT",
    });
  });

  it("still throws an ApiCodedError for a non-OK response", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500, {}));
    await expect(requestJson("/api/x")).rejects.toBeInstanceOf(ApiCodedError);
  });
});
