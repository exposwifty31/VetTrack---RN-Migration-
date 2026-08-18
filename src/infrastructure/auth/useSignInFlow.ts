/**
 * SignInFlowPort adapter over @clerk/expo v4 (PR #75 review). The adapter —
 * not the screen — owns Clerk's hooks and the v4 method-based mechanism:
 * signIn.password() -> returned-{error} check -> status === "complete" ->
 * signIn.finalize() (replaces legacy setActive). Screens import THIS hook and
 * the port types only; the Clerk import boundary test enforces it tree-wide.
 */
import { useAuth, useSignIn, useSSO } from "@clerk/expo";
import { useMemo } from "react";

import {
  SignInFlowUnavailableError,
  type PasswordSignInOutcome,
  type SignInFlowPort,
  type SsoOutcome,
  type SsoStrategy,
} from "@/core/ports/sign-in-flow.port";
import { resolveSignInFieldErrors } from "./sign-in-errors";

/** The non-null SignInFuture resource from the v4 hook. */
type SignInResource = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;

/**
 * One password attempt as a pure sequence (extracted for S3776 — callers map
 * outcomes to state/copy). v4 flows report failures as a returned `{ error }`,
 * not a rejection; both password() and finalize() get the same treatment.
 */
async function runPasswordFlow(
  signIn: SignInResource,
  emailAddress: string,
  password: string,
): Promise<PasswordSignInOutcome> {
  const { error: passwordError } = await signIn.password({ emailAddress, password });
  if (passwordError) return { kind: "failed", cause: passwordError };
  if (signIn.status !== "complete") return { kind: "incomplete", status: signIn.status };
  const { error: finalizeError } = await signIn.finalize();
  if (finalizeError) return { kind: "failed", cause: finalizeError };
  return { kind: "complete" };
}

/** SignInFlowPort over the live Clerk client. Must render under ClerkProvider. */
export function useSignInFlow(): SignInFlowPort {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn, isLoaded } = useAuth();
  const { startSSOFlow } = useSSO();

  return useMemo<SignInFlowPort>(
    () => ({
      ready: signIn != null,
      isSignedIn: isSignedIn === true,
      isLoaded: isLoaded === true,
      fetchStatus: fetchStatus === "fetching" ? "fetching" : "idle",
      fieldErrors: resolveSignInFieldErrors(errors),
      async submitPassword(emailAddress: string, password: string) {
        // Fail LOUD, never a silent no-op (port contract).
        if (!signIn) throw new SignInFlowUnavailableError();
        return runPasswordFlow(signIn, emailAddress, password);
      },
      async startSso(strategy: SsoStrategy): Promise<SsoOutcome> {
        // Browser SSO (v4 asymmetry): the ONE flow that still activates via
        // setActive. A cancelled browser resolves with createdSessionId: null —
        // mapped to "dismissed" so callers stay silent on it by contract.
        const { createdSessionId, setActive } = await startSSOFlow({ strategy });
        if (!createdSessionId || !setActive) return { kind: "dismissed" };
        await setActive({ session: createdSessionId });
        return { kind: "activated" };
      },
    }),
    [signIn, isSignedIn, isLoaded, fetchStatus, errors, startSSOFlow],
  );
}
