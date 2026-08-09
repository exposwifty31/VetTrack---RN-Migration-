/**
 * Live equipment list WITHOUT polling — subscribe-only to the shared SSE port.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls (no timers, no query-refetch intervals). It only `subscribe()`s to
 * `getDefaultRealtimePort()` and invalidates the canonical `['equipment']` key.
 *
 * SHARED: five surfaces mount this at once (Home, Equipment list, Equipment
 * detail, My equipment, Alerts — and the iPad two-pane shows list + detail
 * together), so the subscription itself lives in `equipment-realtime-registry`:
 * N mounts hold ONE port listener and produce ONE invalidation per event. The
 * invalidation rules are documented there and are unchanged.
 *
 * `(rn-architecture)`: gate the side-effect in an effect, subscribe to the shared
 * port, mount inside the equipment screen (not App.tsx).
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { retainEquipmentRealtimeSync } from "./equipment-realtime-registry";

export function useEquipmentRealtimeSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => retainEquipmentRealtimeSync(queryClient), [queryClient]);
}
