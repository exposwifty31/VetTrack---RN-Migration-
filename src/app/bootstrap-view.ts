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
  /**
   * Sticky latch: the gate has already rendered children this mount. A
   * transient flap (failed background refetch, session flag flicker during
   * token refresh — observed on iPad rotation, 2026-08-19) must NOT swap a
   * live Home for the reauth screen: the swap unmounts the whole tab tree and
   * left a leaked native view eating the top-bar's touches. Once latched, only
   * a SETTLED auth failure (isAuthError) may flip the gate back.
   */
  wasReady?: boolean;
  /** The identity query still holds data (stale-while-error) to render from. */
  hasData?: boolean;
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

  // Sticky readiness: latched + data on hand + no settled auth error → stay
  // ready through the flap instead of unmounting a live screen tree.
  if (input.wasReady === true && input.hasData === true && input.isAuthError !== true) {
    return { kind: "ready" };
  }

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
