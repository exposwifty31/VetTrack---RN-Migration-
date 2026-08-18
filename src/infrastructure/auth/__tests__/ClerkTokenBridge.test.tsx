/**
 * W-AUTH contract pin: ClerkTokenBridge wires Clerk into the two framework-free
 * seams (token getter -> auth-fetch, signOut -> authSession) and clears BOTH on
 * sign-out and on unmount. This is the invariant the @clerk/expo v4 upgrade
 * must preserve byte-for-byte — the bridge is the only place the app's Bearer
 * identity enters the Clerk-free tree, so a regression here silently breaks
 * every authFetch call and the sign-out affordance at once.
 */
import { render } from "@testing-library/react-native";

import { getClerkTokenGetter, resolveToken, setClerkTokenGetter } from "@/lib/auth-fetch";
import { getAuthSession, isAuthSessionActive, setSessionSignOut } from "../authSession";
import { ClerkTokenBridge } from "../ClerkTokenBridge";

const mockAuth = {
  isSignedIn: false,
  getToken: jest.fn(async (): Promise<string | null> => null),
  signOut: jest.fn(async () => {}),
};

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => mockAuth,
}));

afterEach(() => {
  setClerkTokenGetter(null);
  setSessionSignOut(null);
  mockAuth.isSignedIn = false;
  mockAuth.getToken.mockReset();
  mockAuth.signOut.mockReset();
});

describe("ClerkTokenBridge seam wiring", () => {
  it("installs the token getter and sign-out seam while signed in", async () => {
    mockAuth.isSignedIn = true;
    mockAuth.getToken.mockResolvedValue("header.payload.sig");

    await render(<ClerkTokenBridge />);

    expect(getClerkTokenGetter()).not.toBeNull();
    await expect(resolveToken()).resolves.toBe("header.payload.sig");

    expect(isAuthSessionActive()).toBe(true);
    await getAuthSession().signOut();
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it("normalizes a non-string getToken result to null", async () => {
    mockAuth.isSignedIn = true;
    mockAuth.getToken.mockResolvedValue(undefined as unknown as string);

    await render(<ClerkTokenBridge />);

    // resolveToken falls through to the stored-token slot (empty under jest).
    await expect(resolveToken()).resolves.toBeNull();
  });

  it("clears both seams when Clerk reports signed-out", async () => {
    mockAuth.isSignedIn = true;
    mockAuth.getToken.mockResolvedValue("a.b.c");
    const view = await render(<ClerkTokenBridge />);
    expect(getClerkTokenGetter()).not.toBeNull();

    mockAuth.isSignedIn = false;
    await view.rerender(<ClerkTokenBridge />);

    expect(getClerkTokenGetter()).toBeNull();
    expect(isAuthSessionActive()).toBe(false);
  });

  it("clears both seams on unmount", async () => {
    mockAuth.isSignedIn = true;
    mockAuth.getToken.mockResolvedValue("a.b.c");
    const view = await render(<ClerkTokenBridge />);
    expect(getClerkTokenGetter()).not.toBeNull();
    expect(isAuthSessionActive()).toBe(true);

    await view.unmount();

    expect(getClerkTokenGetter()).toBeNull();
    expect(isAuthSessionActive()).toBe(false);
  });
});
