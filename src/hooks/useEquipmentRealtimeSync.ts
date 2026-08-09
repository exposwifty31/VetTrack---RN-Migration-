/**
 * Live equipment list WITHOUT polling — subscribe-only to the shared SSE port.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls (no timers, no query-refetch intervals). It only `subscribe()`s to
 * `getDefaultRealtimePort()` and invalidates the canonical `['equipment']` key.
 *
 * It is the `EQUIPMENT_` case of `useRealtimeInvalidation` — named separately
 * because five surfaces mount it by name (Home, Equipment list, Equipment detail,
 * My equipment, Alerts) and the canonical key is not a caller's choice. Sharing,
 * refcounting and the invalidation rules live in `realtime-invalidation-registry`:
 * N mounts hold ONE port listener and produce ONE invalidation per event.
 *
 * `(rn-architecture)`: gate the side-effect in an effect, subscribe to the shared
 * port, mount inside the equipment screen (not App.tsx).
 */
import { equipmentKeys } from "@/lib/api";

import {
  useRealtimeInvalidation,
  type UseRealtimeInvalidationOptions,
} from "./useRealtimeInvalidation";

/**
 * One `EQUIPMENT_` prefix covers custody/dock/readiness/staging/waitlist/RFID,
 * and every sub-resource key nests under `equipmentKeys.all`.
 *
 * Module scope so all five call sites serialize to the same registry key.
 */
const EQUIPMENT_SPEC: UseRealtimeInvalidationOptions = {
  typePrefixes: ["EQUIPMENT_"],
  queryKeys: [equipmentKeys.all],
};

export function useEquipmentRealtimeSync(): void {
  useRealtimeInvalidation(EQUIPMENT_SPEC);
}
