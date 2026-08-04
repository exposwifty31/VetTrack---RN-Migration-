/**
 * Live equipment list WITHOUT polling — subscribe-only to the shared SSE port.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls (no timers, no query-refetch intervals). It only `subscribe()`s to
 * `getDefaultRealtimePort()` and invalidates the canonical `['equipment']` key.
 *
 * Invalidation rules:
 *   - `event`     whose envelope.type starts with `EQUIPMENT_` → invalidate.
 *     (One prefix covers custody/dock/readiness/staging/waitlist/RFID.)
 *   - `reset`     (pruned-cursor resync) → invalidate. REQUIRED.
 *   - `keepalive` (carries activeCodeBlueSessionId) → IGNORE — must not invalidate.
 *   - `state`     → ignore.
 *
 * `(rn-architecture)`: gate the side-effect in an effect, subscribe to the shared
 * port, mount inside the equipment screen (not App.tsx).
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getDefaultRealtimePort } from "@/infrastructure/realtime/defaultRealtime";
import { equipmentKeys } from "@/lib/api";

export function useEquipmentRealtimeSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const port = getDefaultRealtimePort();
    const unsubscribe = port.subscribe((e) => {
      switch (e.kind) {
        case "event":
          if (e.envelope.type.startsWith("EQUIPMENT_")) {
            void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
          }
          break;
        case "reset":
          void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
          break;
        // keepalive + state carry no equipment domain change — ignore.
        default:
          break;
      }
    });
    return unsubscribe;
  }, [queryClient]);
}
