/**
 * Generic subscribe-only realtime invalidation — the useEquipmentRealtimeSync
 * doctrine, parameterized for the G3 screens.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls. It only `subscribe()`s to `getDefaultRealtimePort()` and
 * invalidates the given query keys.
 *
 * SHARED: several surfaces mount this at once, and the iPad two-pane mounts a
 * master and its detail together (RoomsScreen + RoomDetailContent), so the
 * subscription itself lives in `realtime-invalidation-registry`: N mounts hold
 * ONE port listener, and a query key shared by two specs is invalidated ONCE per
 * event. The invalidation rules are documented there and are unchanged.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  deserializeSpec,
  retainRealtimeInvalidation,
  serializeSpec,
  type RealtimeInvalidationSpec,
} from "./realtime-invalidation-registry";

export type UseRealtimeInvalidationOptions = RealtimeInvalidationSpec;

export function useRealtimeInvalidation(options: UseRealtimeInvalidationOptions): void {
  const queryClient = useQueryClient();

  // Callers pass inline literals; retaining on referential identity would
  // re-register every render. The canonical serialization is the stable
  // dependency, and the effect rebuilds the spec from it — so content-equal
  // options never churn the registration and the effect closes over no
  // render-scoped object.
  const specKey = serializeSpec(options);

  useEffect(
    () => retainRealtimeInvalidation(queryClient, specKey, deserializeSpec(specKey)),
    [queryClient, specKey],
  );
}
