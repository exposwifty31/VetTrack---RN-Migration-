import { getConfiguredApiOrigin, resolveApiUrl } from "../api-origin";

describe("resolveApiUrl", () => {
  const prev = process.env.EXPO_PUBLIC_API_ORIGIN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_ORIGIN = prev;
  });

  it("prefixes relative paths with EXPO_PUBLIC_API_ORIGIN", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com/";
    expect(getConfiguredApiOrigin()).toBe("https://api.example.com");
    expect(resolveApiUrl("/api/users/me")).toBe("https://api.example.com/api/users/me");
  });

  it("returns absolute paths unchanged", () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
    expect(resolveApiUrl("https://other.test/x")).toBe("https://other.test/x");
  });

  it("throws when origin is missing for relative paths", () => {
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
    expect(() => resolveApiUrl("/api/users/me")).toThrow(/EXPO_PUBLIC_API_ORIGIN/);
  });
});
