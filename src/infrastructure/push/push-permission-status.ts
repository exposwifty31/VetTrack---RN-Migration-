import { useSyncExternalStore } from "react";

/**
 * W3a/B7 — the readable half of "notification permission was denied".
 *
 * PushBridge's registration effect handled a denial with a bare `return`. As
 * control flow that is right: with no permission there is no token, so there is
 * nothing to register. As product behaviour it is the loudest failure in the
 * push stack — ADR-009 makes this the Code Blue ALERT channel, so a single
 * "Don't Allow" silences emergency alerting permanently and no surface in the
 * app can even tell the user it happened.
 *
 * `QrScanner` already solves the same problem for the camera: render the state,
 * and route to OS settings when the OS will no longer prompt. It can do that
 * only because `useCameraPermissions` exposes the outcome. The push port has no
 * equivalent — `requestPermission()` returns a boolean into a closure — so this
 * module is that missing readable surface, deliberately shaped like
 * `offline-queue-status.ts` (pure state + `useSyncExternalStore` + a test reset)
 * rather than as a new pattern.
 *
 * It stores an OUTCOME, not a capability: "unknown" until the OS has actually
 * answered, so a surface can never claim push is off before anything asked. A
 * cancelled effect (unmount / identity swap mid-prompt) records nothing, for the
 * same reason it does not register a token — see the PushBridge cancellation
 * contract.
 */
export type PushPermissionStatus = "unknown" | "granted" | "denied";

let status: PushPermissionStatus = "unknown";
const listeners = new Set<() => void>();

/** Record the OS's answer. Called only by PushBridge, only when not cancelled. */
export function recordPushPermission(granted: boolean): void {
  const next: PushPermissionStatus = granted ? "granted" : "denied";
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

export function getPushPermissionStatus(): PushPermissionStatus {
  return status;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Live permission status for the Settings surface. */
export function usePushPermissionStatus(): PushPermissionStatus {
  return useSyncExternalStore(subscribe, getPushPermissionStatus, getPushPermissionStatus);
}

/** Test-only — reset to the pre-prompt state. */
export function _resetPushPermissionStatusForTests(): void {
  status = "unknown";
  listeners.clear();
}
