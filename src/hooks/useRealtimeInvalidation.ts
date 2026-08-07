/**
 * Generic subscribe-only realtime invalidation — the useEquipmentRealtimeSync
 * doctrine, parameterized for the G3 screens.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls. It only `subscribe()`s to `getDefaultRealtimePort()` and
 * invalidates the given query keys.
 *
 * Invalidation rules:
 *   - `event` whose envelope.type starts with any of `typePrefixes` → invalidate.
 *   - `event` with type `audit_log` whose payload.actionType ∈ `auditActionTypes`
 *     → invalidate. (Payload path verified against server logAudit →
 *     insertAuditAndOutbox: the outbox payload carries top-level `actionType`;
 *     outboxRowToSse passes payload through 1:1.) `audit_log` envelopes are
 *     handled by this filter ONLY — they never match via `typePrefixes`.
 *   - `reset` (pruned-cursor resync) → invalidate. REQUIRED.
 *   - `keepalive` (carries activeCodeBlueSessionId) → IGNORE — must not invalidate.
 *   - `state` → ignore.
 */
import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { getDefaultRealtimePort } from "@/infrastructure/realtime/defaultRealtime";

const AUDIT_LOG_TYPE = "audit_log";

export type UseRealtimeInvalidationOptions = Readonly<{
  /** Domain-event type prefixes, e.g. ["EQUIPMENT_", "ROOM_"]. */
  typePrefixes?: readonly string[];
  /** `audit_log` payload actionType allowlist, e.g. ["shift_handover_generated"]. */
  auditActionTypes?: readonly string[];
  queryKeys: readonly QueryKey[];
}>;

export function useRealtimeInvalidation(options: UseRealtimeInvalidationOptions): void {
  const queryClient = useQueryClient();

  // Callers pass inline literals; subscribing on referential identity would
  // resubscribe every render. Query keys are JSON-serializable by TanStack
  // contract, so the serialized spec is the stable dependency and the effect
  // re-parses it — content-equal options never churn the subscription.
  const spec = JSON.stringify(options);

  useEffect(() => {
    const { typePrefixes, auditActionTypes, queryKeys } = JSON.parse(
      spec,
    ) as UseRealtimeInvalidationOptions;

    const invalidateAll = () => {
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const port = getDefaultRealtimePort();
    const unsubscribe = port.subscribe((e) => {
      switch (e.kind) {
        case "event": {
          const { type, payload } = e.envelope;
          if (type === AUDIT_LOG_TYPE) {
            const actionType = (payload as { actionType?: unknown } | null | undefined)
              ?.actionType;
            if (
              typeof actionType === "string" &&
              auditActionTypes != null &&
              auditActionTypes.includes(actionType)
            ) {
              invalidateAll();
            }
          } else if (typePrefixes?.some((prefix) => type.startsWith(prefix))) {
            invalidateAll();
          }
          break;
        }
        case "reset":
          invalidateAll();
          break;
        // keepalive + state carry no domain change — ignore.
        default:
          break;
      }
    });
    return unsubscribe;
  }, [queryClient, spec]);
}
