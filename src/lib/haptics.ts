/**
 * Thin expo-haptics wrapper mirroring the web haptics API the handlers expect.
 * Centralizing here keeps direct `expo-haptics` imports out of the screens and
 * makes the three intents (success / error / tap) a single vocabulary.
 *
 * All calls are fire-and-forget and never throw — haptics are a nicety, not a
 * correctness surface, and are absent on some hardware / the simulator.
 */
import * as Haptics from "expo-haptics";

function fireAndForget(run: () => Promise<unknown>): void {
  void run().catch(() => {});
}

export const haptics = {
  /** Successful custody flip. */
  scanSuccess: (): void =>
    fireAndForget(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Conflict / blocked / network failure. */
  error: (): void =>
    fireAndForget(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Light selection feedback on row/confirm press. */
  tap: (): void => fireAndForget(() => Haptics.selectionAsync()),
};
