/**
 * `api.equipment.bindNfcTag` — the second, independently-failable half of
 * provisioning. Programming the sticker and binding its UID to the equipment row
 * are separate operations, and a bind failure must surface as a BIND failure
 * rather than making the operator re-write a tag that is already correct
 * (`vettrack/src/pages/equipment-detail.tsx:940-959`).
 *
 * Server: PATCH /api/equipment/:id, `requireEffectiveRole("technician")` +
 * `equipmentReplayIdempotency` (`vettrack/server/routes/equipment.ts:297-306`).
 * The UID column carries a GLOBAL unique index, so a sticker already bound
 * elsewhere comes back 409 CONFLICT / NFC_TAG_ALREADY_BOUND
 * (`server/routes/equipment/handlers/patch-equipment.ts:200-209`).
 */
import { api } from "../api";
import { ApiCodedError } from "../api/coded-error";

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

/** An id with every CWE-29 hazard: slash, query, fragment, dot segment. */
const HOSTILE_ID = "eq/../1?x=1#frag";
const ENCODED_ID = encodeURIComponent(HOSTILE_ID);

afterEach(() => {
  mockAuthFetch.mockReset();
});

describe("api.equipment.bindNfcTag", () => {
  it("PATCHes only nfcTagId to the encoded id path", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { id: "eq1", nfcTagId: "04a2b3" }));

    await api.equipment.bindNfcTag(HOSTILE_ID, "04a2b3");

    const [path, init] = mockAuthFetch.mock.calls[0]!;
    expect(path).toBe(`/api/equipment/${ENCODED_ID}`);
    expect(init.method).toBe("PATCH");
    // The route accepts ~20 columns; this wrapper must never be a general-purpose
    // PATCH that a caller could aim at `status` or `roomId`.
    expect(JSON.parse(init.body as string)).toEqual({ nfcTagId: "04a2b3" });
  });

  it("sends the x-request-id the endpoint's replay-idempotency guard expects", async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(200, { id: "eq1" }));

    await api.equipment.bindNfcTag("eq1", "04a2b3");

    expect(mockAuthFetch.mock.calls[0]![1].headers).toMatchObject({
      "x-request-id": "test-request-id",
    });
  });

  it("returns the updated row so the caller can refresh from the server truth", async () => {
    const row = { id: "eq1", name: "Ultrasound", nfcTagId: "04a2b3" };
    mockAuthFetch.mockResolvedValue(makeResponse(200, row));

    await expect(api.equipment.bindNfcTag("eq1", "04a2b3")).resolves.toEqual(row);
  });

  it("surfaces NFC_TAG_ALREADY_BOUND as a coded 409 the card can branch on", async () => {
    mockAuthFetch.mockResolvedValue(
      makeResponse(409, {
        code: "CONFLICT",
        reason: "NFC_TAG_ALREADY_BOUND",
        message: "This NFC tag is already bound to other equipment",
      }),
    );

    await expect(api.equipment.bindNfcTag("eq1", "04a2b3")).rejects.toMatchObject({
      status: 409,
      reason: "NFC_TAG_ALREADY_BOUND",
    });
    await expect(api.equipment.bindNfcTag("eq1", "04a2b3")).rejects.toBeInstanceOf(ApiCodedError);
  });
});
