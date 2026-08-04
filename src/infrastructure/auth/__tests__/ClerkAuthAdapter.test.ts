import { ClerkAuthAdapter } from "../ClerkAuthAdapter";
import { setClerkTokenGetter } from "@/lib/auth-fetch";

describe("ClerkAuthAdapter", () => {
  afterEach(() => {
    setClerkTokenGetter(null);
  });

  it("reads token via the injected getter and notifies listeners on signOut", async () => {
    setClerkTokenGetter(async () => "a.b.c");
    const signOut = jest.fn(async () => undefined);
    const adapter = new ClerkAuthAdapter(signOut);
    const seen: Array<string | null> = [];
    const unsubscribe = adapter.onSessionChange((token) => {
      seen.push(token);
    });

    expect(await adapter.getToken()).toBe("a.b.c");
    await adapter.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([null]);
    unsubscribe();
  });
});
