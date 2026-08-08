/**
 * The polling-gate contract (Slice 8). `computeRefetchInterval` is the SOLE
 * governor of the shift-chat poll cadence fed to react-query `refetchInterval`,
 * so these assertions ARE the "poll provably stops on blur/background" proof:
 * the cadence is `false` (react-query stops the interval) the instant any gate
 * condition drops.
 */
import { computeRefetchInterval, SHIFT_CHAT_POLL_MS } from "../poll-gate";

const OPEN = { isFocused: true, appActive: true, hasWindow: true } as const;

describe("computeRefetchInterval", () => {
  it("polls at the cadence only when focused AND foregrounded AND windowed", () => {
    expect(computeRefetchInterval(OPEN, SHIFT_CHAT_POLL_MS)).toBe(SHIFT_CHAT_POLL_MS);
  });

  it("STOPS (false) the instant the screen blurs", () => {
    expect(computeRefetchInterval({ ...OPEN, isFocused: false }, SHIFT_CHAT_POLL_MS)).toBe(false);
  });

  it("STOPS (false) the instant the app backgrounds", () => {
    expect(computeRefetchInterval({ ...OPEN, appActive: false }, SHIFT_CHAT_POLL_MS)).toBe(false);
  });

  it("STOPS (false) when there is no active window (off-window 403 / null session)", () => {
    expect(computeRefetchInterval({ ...OPEN, hasWindow: false }, SHIFT_CHAT_POLL_MS)).toBe(false);
  });

  it("stays stopped when several conditions drop together", () => {
    expect(
      computeRefetchInterval({ isFocused: false, appActive: false, hasWindow: false }, SHIFT_CHAT_POLL_MS),
    ).toBe(false);
  });

  it("uses a cadence comfortably under the 100/min global limiter", () => {
    // 60000 / cadence = requests per minute; keep it well under 100.
    expect(60000 / SHIFT_CHAT_POLL_MS).toBeLessThan(60);
    expect(SHIFT_CHAT_POLL_MS).toBeGreaterThanOrEqual(2000);
  });
});
