/**
 * Day-view clock state for the Tasks screen. Mount captures the LOCAL today;
 * an AppState foreground transition recomputes it, and a calendar rollover
 * advances the selected day only when it was pinned to the previous today
 * (manually chosen days never move). Clock state ONLY — no timers, no data
 * polling; data freshness stays on the SSE invalidation path.
 */
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { isoDayString } from "@/lib/datetime";

export type TaskDayState = Readonly<{
  /** The current local calendar day (YYYY-MM-DD). */
  today: string;
  /** The selected day the list is showing. */
  day: string;
  setDay: (day: string | ((current: string) => string)) => void;
  isToday: boolean;
}>;

export function useTaskDay(): TaskDayState {
  const [today, setToday] = useState<string>(() => isoDayString(Date.now()) ?? "");
  const [day, setDay] = useState<string>(today);
  // The listener reads through a ref so the [] effect never resubscribes and
  // never closes over a stale today.
  const todayRef = useRef(today);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = isoDayString(Date.now());
      if (!next || next === todayRef.current) return;
      const previous = todayRef.current;
      todayRef.current = next;
      setToday(next);
      setDay((current) => (current === previous ? next : current));
    });
    return () => subscription.remove();
  }, []);

  return { today, day, setDay, isToday: day === today };
}
