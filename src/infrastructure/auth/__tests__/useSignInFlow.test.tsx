/**
 * W-AUTH / PR #75 review: the sign-in Port adapter. The adapter — not the
 * screen — owns Clerk's useAuth/useSignIn and the v4 password->status->finalize
 * mechanism; screens consume the SignInFlowPort interface. Pinned here:
 *
 *   - the outcome mapping (complete / incomplete / failed for BOTH the
 *     returned-{error} and finalize-{error} shapes)
 *   - fail-loud: submitting with no SignIn resource throws the explicit
 *     configuration error, never a silent no-op
 *   - ready / isSignedIn reflection
 */
import { renderHook } from "@testing-library/react-native";

import { SignInFlowUnavailableError } from "@/core/ports/sign-in-flow.port";
import { useSignInFlow } from "../useSignInFlow";

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockSignIn: { status: string; password: jest.Mock; finalize: jest.Mock } = {
  status: "needs_first_factor",
  password: mockPassword,
  finalize: mockFinalize,
};

const mockClerkState: { signIn: typeof mockSignIn | null; isSignedIn: boolean } = {
  signIn: mockSignIn,
  isSignedIn: false,
};

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: mockClerkState.signIn,
    errors: { fields: { identifier: null, password: null }, raw: null, global: null },
    fetchStatus: "idle",
  }),
  useAuth: () => ({ isSignedIn: mockClerkState.isSignedIn, isLoaded: true }),
}));

beforeEach(() => {
  mockPassword.mockReset();
  mockFinalize.mockReset();
  mockSignIn.status = "needs_first_factor";
  mockClerkState.signIn = mockSignIn;
  mockClerkState.isSignedIn = false;
});

async function flow() {
  const view = await renderHook(() => useSignInFlow());
  return view.result.current;
}

describe("useSignInFlow outcome mapping", () => {
  it("complete: password ok -> status complete -> finalize ok", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignIn.status = "complete";
      return { error: null };
    });
    mockFinalize.mockResolvedValue({ error: null });

    await expect((await flow()).submitPassword("vet@example.com", "pw")).resolves.toEqual({
      kind: "complete",
    });
    expect(mockPassword).toHaveBeenCalledWith({ emailAddress: "vet@example.com", password: "pw" });
  });

  it("failed: password() reports a returned { error } (v4 shape, not a rejection)", async () => {
    const cause = new Error("raw provider detail");
    mockPassword.mockResolvedValue({ error: cause });

    await expect((await flow()).submitPassword("a@b.c", "pw")).resolves.toEqual({
      kind: "failed",
      cause,
    });
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("failed: finalize() reports a returned { error }", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignIn.status = "complete";
      return { error: null };
    });
    const cause = new Error("finalize detail");
    mockFinalize.mockResolvedValue({ error: cause });

    await expect((await flow()).submitPassword("a@b.c", "pw")).resolves.toEqual({
      kind: "failed",
      cause,
    });
  });

  it("incomplete: a non-complete status is surfaced with the status verbatim", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignIn.status = "needs_second_factor";
      return { error: null };
    });

    await expect((await flow()).submitPassword("a@b.c", "pw")).resolves.toEqual({
      kind: "incomplete",
      status: "needs_second_factor",
    });
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("rejections propagate to the caller (the screen owns generic-copy mapping)", async () => {
    mockPassword.mockRejectedValue(new Error("network down"));
    await expect((await flow()).submitPassword("a@b.c", "pw")).rejects.toThrow("network down");
  });
});

describe("useSignInFlow availability", () => {
  it("fails LOUD with the explicit configuration error when the SignIn resource is absent", async () => {
    mockClerkState.signIn = null;
    const view = await flow();

    expect(view.ready).toBe(false);
    await expect(view.submitPassword("a@b.c", "pw")).rejects.toBeInstanceOf(
      SignInFlowUnavailableError,
    );
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it("reflects readiness and the signed-in state", async () => {
    mockClerkState.isSignedIn = true;
    const view = await flow();
    expect(view.ready).toBe(true);
    expect(view.isSignedIn).toBe(true);
  });
});
