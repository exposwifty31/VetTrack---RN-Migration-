/**
 * Module-level sharing layer behind `useEquipmentRealtimeSync`.
 *
 * WHY: the hook is mounted by five surfaces at once — Home, Equipment list,
 * Equipment detail, My equipment, Alerts — and the iPad two-pane shows list and
 * detail together. One `port.subscribe()` per mount meant N listeners on the SSE
 * port and N identical `['equipment']` invalidations for every EQUIPMENT_* event.
 * The extra invalidations were harmless for correctness (invalidation is
 * idempotent) but multiplied refetch work on every event.
 *
 * WHAT IT DOES NOT CHANGE: the doctrine is untouched. Still subscribe-only —
 * never opens/closes the stream (RealtimeBridge owns the lifecycle), never
 * constructs an event source, never polls. This adds no transport; it collapses
 * duplicate consumers of the existing one.
 *
 * Refcounted per QueryClient rather than globally, so the registry stays correct
 * if a second client ever exists (tests do this): the port listener lives while
 * ANY mount holds it, and each registered client is invalidated exactly once.
 */
import type { QueryClient } from "@tanstack/react-query";

import type { RealtimePort, RealtimeEvent } from "@/core/ports/realtime.port";
import { getDefaultRealtimePort } from "@/infrastructure/realtime/defaultRealtime";
import { equipmentKeys } from "@/lib/api";

const EQUIPMENT_TYPE_PREFIX = "EQUIPMENT_";

/** QueryClient → how many mounts currently hold it. Five screens = one entry, count 5. */
const holders = new Map<QueryClient, number>();

let subscribedPort: RealtimePort | null = null;
let unsubscribeFromPort: (() => void) | null = null;

function invalidateEachClientOnce(): void {
  for (const queryClient of holders.keys()) {
    void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
  }
}

/**
 * Invalidation rules — unchanged from the pre-sharing hook:
 *   - `event` whose envelope.type starts with `EQUIPMENT_` → invalidate.
 *     (One prefix covers custody/dock/readiness/staging/waitlist/RFID.)
 *   - `reset` (pruned-cursor resync) → invalidate. REQUIRED.
 *   - `keepalive` (carries activeCodeBlueSessionId) → IGNORE — must not invalidate.
 *   - `state` → ignore.
 */
function handleRealtimeEvent(event: RealtimeEvent): void {
  switch (event.kind) {
    case "event":
      if (event.envelope.type.startsWith(EQUIPMENT_TYPE_PREFIX)) {
        invalidateEachClientOnce();
      }
      break;
    case "reset":
      invalidateEachClientOnce();
      break;
    // keepalive + state carry no equipment domain change — ignore.
    default:
      break;
  }
}

function detachFromPort(): void {
  unsubscribeFromPort?.();
  unsubscribeFromPort = null;
  subscribedPort = null;
}

/**
 * Register one mount. Returns its release fn — the LAST release detaches the
 * shared port listener.
 */
export function retainEquipmentRealtimeSync(queryClient: QueryClient): () => void {
  holders.set(queryClient, (holders.get(queryClient) ?? 0) + 1);

  // Re-resolved every retain, not cached once: `__resetDefaultRealtimePortForTests`
  // can swap the singleton, and holding a closure over a dead port would silently
  // stop delivering events.
  const port = getDefaultRealtimePort();
  if (subscribedPort !== port) {
    detachFromPort();
    subscribedPort = port;
    unsubscribeFromPort = port.subscribe(handleRealtimeEvent);
  }

  let released = false;
  return () => {
    // React can run a cleanup only once, but a double release would corrupt the
    // refcount and drop the listener while mounts remain — so make it explicit.
    if (released) return;
    released = true;

    const remaining = (holders.get(queryClient) ?? 1) - 1;
    if (remaining > 0) {
      holders.set(queryClient, remaining);
    } else {
      holders.delete(queryClient);
    }
    if (holders.size === 0) detachFromPort();
  };
}

/** Test-only: drop every holder and the shared listener between suites. */
export function __resetEquipmentRealtimeRegistryForTests(): void {
  holders.clear();
  detachFromPort();
}
