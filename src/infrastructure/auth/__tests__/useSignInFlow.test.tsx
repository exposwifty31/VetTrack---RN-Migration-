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

type MockFieldError = { code: string; message: string } | null;
const mockClerkState: {
  signIn: typeof mockSignIn | null;
  isSignedIn: boolean;
  isLoaded: boolean;
  fetchStatus: "idle" | "fetching";
  fields: { identifier: MockFieldError; password: MockFieldError };
} = {
  signIn: mockSignIn,
  isSignedIn: false,
  isLoaded: true,
  fetchStatus: "idle",
  fields: { identifier: null, password: null },
};

const mockStartSSOFlow = jest.fn();
const mockSsoSetActive = jest.fn();

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: mockClerkState.signIn,
    errors: { fields: mockClerkState.fields, raw: null, global: null },
    fetchStatus: mockClerkState.fetchStatus,
  }),
  useAuth: () => ({ isSignedIn: mockClerkState.isSignedIn, isLoaded: mockClerkState.isLoaded }),
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

beforeEach(() => {
  mockPassword.mockReset();
  mockFinalize.mockReset();
  mockStartSSOFlow.mockReset();
  mockSsoSetActive.mockReset();
  mockSignIn.status = "needs_first_factor";
  mockClerkState.signIn = mockSignIn;
  mockClerkState.isSignedIn = false;
  mockClerkState.isLoaded = true;
  mockClerkState.fetchStatus = "idle";
  mockClerkState.fields = { identifier: null, password: null };
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

/**
 * W-AUTH PR-B: the branded screen's port surface — fetchStatus, field-error
 * flags, the loading gate, and browser SSO. SSO is the ONE flow that still
 * uses setActive (v4 asymmetry, verified against the installed .d.ts).
 */
describe("useSignInFlow branded surface (PR-B)", () => {
  it("exposes fetchStatus and isLoaded from the SDK", async () => {
    mockClerkState.fetchStatus = "fetching";
    mockClerkState.isLoaded = false;
    const view = await flow();
    expect(view.fetchStatus).toBe("fetching");
    expect(view.isLoaded).toBe(false);
  });

  it("maps errors.fields to framework-free flags — raw messages never cross the port", async () => {
    mockClerkState.fields = {
      identifier: { code: "form_identifier_not_found", message: "raw provider text" },
      password: null,
    };
    const view = await flow();
    expect(view.fieldErrors).toEqual({ identifier: true, password: false });
  });

  it("startSso: activates the created session via setActive and reports activation", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_sso",
      setActive: mockSsoSetActive,
    });
    const view = await flow();

    await expect(view.startSso("oauth_google")).resolves.toEqual({ kind: "activated" });
    expect(mockStartSSOFlow).toHaveBeenCalledWith({ strategy: "oauth_google" });
    expect(mockSsoSetActive).toHaveBeenCalledWith({ session: "sess_sso" });
  });

  it("startSso: a null createdSessionId (user cancelled) maps to dismissed — no activation", async () => {
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: null, setActive: mockSsoSetActive });
    const view = await flow();

    await expect(view.startSso("oauth_apple")).resolves.toEqual({ kind: "dismissed" });
    expect(mockSsoSetActive).not.toHaveBeenCalled();
  });

  it("startSso rejections propagate (the screen owns generic-copy mapping)", async () => {
    mockStartSSOFlow.mockRejectedValue(new Error("browser closed the pipe"));
    const view = await flow();
    await expect(view.startSso("oauth_apple")).rejects.toThrow("browser closed the pipe");
  });
});
