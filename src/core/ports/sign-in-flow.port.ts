/**
 * Framework-free sign-in flow port (PR #75 review — screens never touch Clerk
 * hooks; they consume this interface via the infrastructure adapter).
 */

/** Discriminated result of one password sign-in attempt. */
export type PasswordSignInOutcome =
  | { kind: "complete" }
  | { kind: "incomplete"; status: string }
  | { kind: "failed"; cause: unknown };

/**
 * Thrown when a sign-in is submitted while no flow resource exists (SDK client
 * not loaded / provider not mounted). A missing adapter must fail LOUD — a
 * silent no-op here would swallow a user's tap on "sign in".
 */
export class SignInFlowUnavailableError extends Error {
  constructor() {
    super("SIGN_IN_FLOW_UNAVAILABLE: no SignIn resource — is ClerkProvider mounted and loaded?");
    this.name = "SignInFlowUnavailableError";
  }
}

/** What a sign-in surface may do — independent of the auth vendor. */
export interface SignInFlowPort {
  /** The flow resource exists and can accept a submission. */
  readonly ready: boolean;
  /** An interactive session is already active. */
  readonly isSignedIn: boolean;
  /**
   * Submit an email + password. Resolves to a discriminated outcome; rejects
   * only on transport-level failures (and with SignInFlowUnavailableError when
   * called while not ready). Never resolves with raw provider copy for the UI —
   * the caller maps outcomes to its own localized strings.
   */
  submitPassword(emailAddress: string, password: string): Promise<PasswordSignInOutcome>;
}
