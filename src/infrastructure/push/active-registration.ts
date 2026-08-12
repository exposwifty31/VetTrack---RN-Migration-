import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";

/**
 * The pre-sign-out deregister seam.
 *
 * The "cleared" auth event fires AFTER the Clerk token getter is torn down, so a
 * deregister driven by it cannot authenticate — the server would keep the device
 * subscription until delivery-failure pruning. Sign-out UI calls
 * `deregisterActivePushRegistration()` BEFORE clearing the credential, while the
 * bearer is still valid.
 *
 * Take-once by design: the first caller (sign-out UI or the late "cleared"
 * fallback in PushBridge) consumes the registration; the second resolves without
 * a duplicate DELETE. Module-level (not React state) because sign-out UI and the
 * headless bridge live in different trees.
 */
let active: { port: PushPort; token: PushDeviceToken } | null = null;

/** PushBridge records each successful registration (initial or rotated) here. */
export function setActivePushRegistration(port: PushPort, token: PushDeviceToken): void {
  active = { port, token };
}

/** PushBridge clears the record when the auth session ends without a deregister target. */
export function clearActivePushRegistration(): void {
  active = null;
}

/**
 * Deregister the active device token (take-once, best-effort). Await it BEFORE
 * tearing down the auth session so the DELETE still carries a valid bearer. A
 * failed DELETE is swallowed — sign-out must never block on push cleanup.
 */
export async function deregisterActivePushRegistration(): Promise<void> {
  const current = active;
  active = null;
  if (!current) return;
  try {
    await current.port.deregister(current.token);
  } catch {
    // Best-effort: an expired/absent bearer or a network drop leaves an orphan the
    // server prunes on delivery failure. Never surface this to the sign-out flow.
  }
}
