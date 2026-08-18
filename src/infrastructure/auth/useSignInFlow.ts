/**
 * SignInFlowPort adapter over @clerk/expo v4 (PR #75 review). The adapter —
 * not the screen — owns Clerk's hooks and the v4 method-based mechanism:
 * signIn.password() -> returned-{error} check -> status === "complete" ->
 * signIn.finalize() (replaces legacy setActive). Screens import THIS hook and
 * the port types only; the Clerk import boundary test enforces it tree-wide.
 */
import { useAuth, useSignIn } from "@clerk/expo";
import { useMemo } from "react";

import {
  SignInFlowUnavailableError,
  type PasswordSignInOutcome,
  type SignInFlowPort,
} from "@/core/ports/sign-in-flow.port";

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
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();

  return useMemo<SignInFlowPort>(
    () => ({
      ready: signIn != null,
      isSignedIn: isSignedIn === true,
      async submitPassword(emailAddress: string, password: string) {
        // Fail LOUD, never a silent no-op (port contract).
        if (!signIn) throw new SignInFlowUnavailableError();
        return runPasswordFlow(signIn, emailAddress, password);
      },
    }),
    [signIn, isSignedIn],
  );
}
