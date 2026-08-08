/**
 * `true` while the app is foregrounded (`AppState === "active"`). One half of
 * the shift-chat poll gate (the other is navigation focus) — RN + react-query
 * do not track app foreground/background by default, so we wire it explicitly.
 *
 * The initial value is read synchronously from `AppState.currentState` so the
 * first render already reflects reality; the listener only flips it on change
 * (setState lives in the event handler, not the effect body — repo lint rule
 * `react-hooks/set-state-in-effect`).
 */
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const onChange = (state: AppStateStatus) => setActive(state === "active");
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  return active;
}
