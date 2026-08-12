/**
 * Pure view decision for `BootstrapGate` — kept out of the component so it can be
 * unit-tested (rn-architecture: gate side-effects in a container, keep screens pure).
 *
 * Fix (a): a not-ready gate with NO active session is a signed-OUT cold start /
 * failed identity — it must route to SignIn, not offer a retry that can only fail.
 * When a session IS active (e.g. pending approval, role below floor) retry is the
 * right affordance and SignIn would be wrong (the user is already signed in).
 */
import { hasRoleAtLeast } from "@/lib/roles";

export interface BootstrapViewInput {
  isPending: boolean;
  isSuccess: boolean;
  hasUserId: boolean;
  effectiveRole: string | null | undefined;
  hasActiveSession: boolean;
  /**
   * The identity query failed with a 401/403 coded error. With an ACTIVE session
   * that means the session itself is dead server-side (revoked user, clinic
   * reassignment, stale device session) — retry can only fail; the affordance
   * must be sign-out-and-sign-in.
   */
  isAuthError?: boolean;
}

export type BootstrapView =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "reauth"; canSignIn: boolean; canReauth: boolean; canRetry: boolean };

export function resolveBootstrapView(input: BootstrapViewInput): BootstrapView {
  if (input.isPending) return { kind: "loading" };

  const ready =
    input.isSuccess && input.hasUserId && hasRoleAtLeast(input.effectiveRole, "student");
  if (ready) return { kind: "ready" };

  const canSignIn = !input.hasActiveSession;
  const canReauth = input.hasActiveSession && input.isAuthError === true;
  return {
    kind: "reauth",
    canSignIn,
    canReauth,
    // Retry re-runs the identity request — offer it ONLY when no auth affordance
    // applies (a rejected session can only fail again; CodeRabbit PR #55).
    canRetry: !canSignIn && !canReauth,
  };
}
