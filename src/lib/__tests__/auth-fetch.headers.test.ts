/**
 * W2b transport: authenticated /api requests must carry the user's current UI
 * locale as `X-Locale` (parity with the Capacitor client — the RN app sent it
 * on no request, so server-localized strings could never reflect the user's
 * choice). A caller-supplied `X-Locale` is left untouched.
 */
import { authFetch } from "../auth-fetch";
import { setCurrentUserId, setStoredBearerToken } from "../auth-store";
import { __resetLocaleCacheForTests, persistLocale } from "@/i18n/locale-resolver";

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();
const prevOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example.com";
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  if (prevOrigin === undefined) {
    delete process.env.EXPO_PUBLIC_API_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_API_ORIGIN = prevOrigin;
  }
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  setStoredBearerToken("a.b.c");
  setCurrentUserId("user_1");
  __resetLocaleCacheForTests();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  } as unknown as Response);
});

afterEach(() => {
  mockFetch.mockReset();
  setStoredBearerToken(null);
  __resetLocaleCacheForTests();
});

function sentHeaders(): Headers {
  const init = mockFetch.mock.calls[0][1] as RequestInit;
  return new Headers(init.headers);
}

describe("authFetch X-Locale", () => {
  it("sends the persisted locale as X-Locale on an /api request", async () => {
    persistLocale("en");
    await authFetch("/api/users/me");
    expect(sentHeaders().get("X-Locale")).toBe("en");
  });

  it("reflects a later locale change", async () => {
    persistLocale("he");
    await authFetch("/api/users/me");
    expect(sentHeaders().get("X-Locale")).toBe("he");
  });

  it("does not override a caller-supplied X-Locale", async () => {
    persistLocale("he");
    await authFetch("/api/users/me", { headers: { "X-Locale": "en" } });
    expect(sentHeaders().get("X-Locale")).toBe("en");
  });
});
