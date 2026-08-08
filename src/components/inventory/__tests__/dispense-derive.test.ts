import {
  buildDispenseRequest,
  dispensePayloadSignature,
  resolveStableIdempotencyKey,
} from "../dispense-derive";

describe("buildDispenseRequest", () => {
  it("rejects when no line has a positive quantity (NO_ITEMS)", () => {
    expect(buildDispenseRequest({ quantities: {}, isEmergency: false, bypassReason: null })).toEqual({
      ok: false,
      reason: "NO_ITEMS",
    });
    expect(
      buildDispenseRequest({ quantities: { i1: 0, i2: 0 }, isEmergency: false, bypassReason: null }),
    ).toEqual({ ok: false, reason: "NO_ITEMS" });
  });

  it("requires a bypassReason when isEmergency (mirrors the server Zod refine)", () => {
    expect(
      buildDispenseRequest({ quantities: { i1: 2 }, isEmergency: true, bypassReason: null }),
    ).toEqual({ ok: false, reason: "MISSING_BYPASS_REASON" });
  });

  it("builds a normal request, dropping zero/negative lines and sorting by itemId", () => {
    const result = buildDispenseRequest({
      quantities: { zeta: 1, alpha: 3, skip: 0, neg: -2 },
      isEmergency: false,
      bypassReason: null,
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        items: [
          { itemId: "alpha", quantity: 3 },
          { itemId: "zeta", quantity: 1 },
        ],
        isEmergency: false,
      },
    });
  });

  it("includes bypassReason only on an emergency request", () => {
    const result = buildDispenseRequest({
      quantities: { i1: 1 },
      isEmergency: true,
      bypassReason: "EMERGENCY_CPR",
    });
    expect(result).toEqual({
      ok: true,
      payload: { items: [{ itemId: "i1", quantity: 1 }], isEmergency: true, bypassReason: "EMERGENCY_CPR" },
    });
  });

  it("drops non-integer quantities", () => {
    expect(
      buildDispenseRequest({ quantities: { i1: 1.5 }, isEmergency: false, bypassReason: null }),
    ).toEqual({ ok: false, reason: "NO_ITEMS" });
  });

  it("orders lines by a deterministic localeCompare of itemId", () => {
    const result = buildDispenseRequest({
      quantities: { c: 1, a: 2, b: 3, aa: 4 },
      isEmergency: false,
      bypassReason: null,
    });
    if (!result.ok) throw new Error("expected a valid payload");
    expect(result.payload.items.map((line) => line.itemId)).toEqual(["a", "aa", "b", "c"]);
  });
});

describe("dispensePayloadSignature (idempotency-key stability)", () => {
  it("is identical for an identical payload — a retry reuses the SAME key", () => {
    const a = buildDispenseRequest({ quantities: { i1: 2, i2: 1 }, isEmergency: false, bypassReason: null });
    const b = buildDispenseRequest({ quantities: { i2: 1, i1: 2 }, isEmergency: false, bypassReason: null });
    if (!a.ok || !b.ok) throw new Error("expected valid payloads");
    expect(dispensePayloadSignature(a.payload)).toBe(dispensePayloadSignature(b.payload));
  });

  it("changes when a quantity changes — a genuinely different attempt mints a new key", () => {
    const a = buildDispenseRequest({ quantities: { i1: 2 }, isEmergency: false, bypassReason: null });
    const b = buildDispenseRequest({ quantities: { i1: 3 }, isEmergency: false, bypassReason: null });
    if (!a.ok || !b.ok) throw new Error("expected valid payloads");
    expect(dispensePayloadSignature(a.payload)).not.toBe(dispensePayloadSignature(b.payload));
  });

  it("changes when emergency/bypassReason changes", () => {
    const normal = buildDispenseRequest({ quantities: { i1: 1 }, isEmergency: false, bypassReason: null });
    const emergency = buildDispenseRequest({ quantities: { i1: 1 }, isEmergency: true, bypassReason: "TECH_ERROR" });
    if (!normal.ok || !emergency.ok) throw new Error("expected valid payloads");
    expect(dispensePayloadSignature(normal.payload)).not.toBe(dispensePayloadSignature(emergency.payload));
  });
});

describe("resolveStableIdempotencyKey (the double-dispense guard)", () => {
  it("reuses the previous key WITHOUT minting when the signature is unchanged (retry)", () => {
    const mint = jest.fn(() => "should-not-be-called");
    const previous = { key: "attempt-1", signature: "sig-A" };
    const result = resolveStableIdempotencyKey(previous, "sig-A", mint);
    expect(result).toBe(previous);
    expect(result.key).toBe("attempt-1");
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints a fresh key when there is no previous attempt", () => {
    const mint = jest.fn(() => "fresh-key");
    const result = resolveStableIdempotencyKey(null, "sig-A", mint);
    expect(result).toEqual({ key: "fresh-key", signature: "sig-A" });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints a fresh key when the payload changed (a genuinely different dispense)", () => {
    const mint = jest.fn(() => "fresh-key-2");
    const previous = { key: "attempt-1", signature: "sig-A" };
    const result = resolveStableIdempotencyKey(previous, "sig-B", mint);
    expect(result).toEqual({ key: "fresh-key-2", signature: "sig-B" });
    expect(mint).toHaveBeenCalledTimes(1);
  });
});
