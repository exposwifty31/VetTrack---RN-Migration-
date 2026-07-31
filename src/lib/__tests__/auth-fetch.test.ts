import {
  decodeJwtPayload,
  getClerkTokenGetter,
  isValidJwt,
  resolveToken,
  setClerkTokenGetter,
} from "../auth-fetch";

function toBase64Url(json: string): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(json)
      : (globalThis as { Buffer: { from(data: string): { toString(enc: string): string } } }).Buffer.from(
          json,
        ).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe("auth-fetch token seam", () => {
  afterEach(() => {
    setClerkTokenGetter(null);
  });

  it("injects and clears the Clerk token getter", async () => {
    expect(getClerkTokenGetter()).toBeNull();
    setClerkTokenGetter(async () => "a.b.c");
    expect(await resolveToken()).toBe("a.b.c");
    setClerkTokenGetter(null);
    expect(await resolveToken()).toBeNull();
  });

  it("prefers the injected getter when set", async () => {
    setClerkTokenGetter(async () => "  x.y.z  ");
    expect(await resolveToken()).toBe("x.y.z");
  });

  it("validates 3-segment JWTs", () => {
    expect(isValidJwt("a.b.c")).toBe(true);
    expect(isValidJwt("not-a-jwt")).toBe(false);
    expect(isValidJwt(null)).toBe(false);
  });

  it("decodes JWT payload for azp inspection", () => {
    const token = makeJwt({ azp: "https://example.com", sub: "user_1" });
    const payload = decodeJwtPayload(token);
    expect(payload?.azp).toBe("https://example.com");
    expect(payload?.sub).toBe("user_1");
  });

  it("returns null payload when azp claim is absent", () => {
    const token = makeJwt({ sub: "user_1" });
    const payload = decodeJwtPayload(token);
    expect(payload).not.toBeNull();
    expect(payload?.azp).toBeUndefined();
  });
});
