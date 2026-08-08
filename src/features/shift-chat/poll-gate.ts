/**
 * The shift-chat polling gate (G3 Slice 8) — THE ONE sanctioned polling surface
 * (G3-PLAN §1.4). Pure so the "poll provably stops on blur/background" contract
 * is a unit-testable fact, not an integration guess: the cadence is governed
 * ENTIRELY by this function's return value fed to react-query `refetchInterval`.
 *
 * The interval runs ONLY when all three hold:
 *   - `isFocused`  — the chat screen is the focused route (navigation focus);
 *   - `appActive`  — the app is foregrounded (AppState === "active");
 *   - `hasWindow`  — the caller has an active roster window (a null-window /
 *                    off-window snapshot must not be re-polled — that would
 *                    re-hit the 403 every interval and burn the rate limiter).
 *
 * Any false → `false`, which tells react-query to STOP the interval. Recovery
 * (a shift starting while the screen is open) comes from a manual retry that
 * refetches the full window.
 */

/** Poll cadence while the gate is open — comfortably under the 100/min limiter. */
export const SHIFT_CHAT_POLL_MS = 4000;

export type PollGate = Readonly<{
  isFocused: boolean;
  appActive: boolean;
  hasWindow: boolean;
}>;

/** `pollMs` when every gate condition holds, otherwise `false` (stop polling). */
export function computeRefetchInterval(gate: PollGate, pollMs: number): number | false {
  return gate.isFocused && gate.appActive && gate.hasWindow ? pollMs : false;
}
