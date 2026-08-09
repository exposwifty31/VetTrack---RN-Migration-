/**
 * Module-level sharing layer behind every realtime-invalidation hook.
 *
 * WHY: each mount used to call `port.subscribe()` on its own, so one SSE event
 * produced N listener invocations and N invalidations. Two real cases:
 *   - the same spec mounted many times — `useEquipmentRealtimeSync` is mounted by
 *     five surfaces at once (Home, Equipment list, Equipment detail, My equipment,
 *     Alerts), and the iPad two-pane shows list and detail together;
 *   - DIFFERENT specs sharing a query key — RoomsScreen invalidates `[rooms]` and
 *     RoomDetailContent invalidates `[rooms]` + `[docking]`, and the iPad two-pane
 *     mounts both, so every `ROOM_*` event hit `[rooms]` twice.
 * Correctness was never at risk (invalidation is idempotent) but the refetch work
 * multiplied by the number of mounted surfaces on every event.
 *
 * WHAT IT DOES NOT CHANGE: the doctrine is untouched. Still subscribe-only —
 * never opens/closes the stream (RealtimeBridge owns the lifecycle), never
 * constructs an event source, never polls. This adds no transport; it collapses
 * duplicate consumers of the existing one.
 *
 * Two dedupe axes, and they are not the same thing:
 *   - LIFECYCLE is refcounted per `(QueryClient, spec)`, so repeat mounts of one
 *     spec hold a single entry and the port listener lives while ANY mount remains.
 *   - INVALIDATION is deduped per `(QueryClient, query key)` per event, which is
 *     what covers the overlapping-key case above. Spec-level dedupe alone would
 *     not have fixed Rooms.
 */
import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";

import type { RealtimePort, RealtimeEvent } from "@/core/ports/realtime.port";
import { getDefaultRealtimePort } from "@/infrastructure/realtime/defaultRealtime";

const AUDIT_LOG_TYPE = "audit_log";

export type RealtimeInvalidationSpec = Readonly<{
  /** Domain-event type prefixes, e.g. ["EQUIPMENT_", "ROOM_"]. */
  typePrefixes?: readonly string[];
  /** `audit_log` payload actionType allowlist, e.g. ["shift_handover_generated"]. */
  auditActionTypes?: readonly string[];
  queryKeys: readonly QueryKey[];
}>;

type Entry = { count: number; readonly spec: RealtimeInvalidationSpec };

/** QueryClient → its live specs, keyed by canonical serialization. */
const holders = new Map<QueryClient, Map<string, Entry>>();

let subscribedPort: RealtimePort | null = null;
let unsubscribeFromPort: (() => void) | null = null;

/**
 * Content identity for a spec, independent of the literal's field order.
 * Callers pass inline object literals, so referential identity would churn the
 * subscription every render; the serialized form is the stable one.
 */
export function serializeSpec(spec: RealtimeInvalidationSpec): string {
  return JSON.stringify([
    spec.typePrefixes ?? null,
    spec.auditActionTypes ?? null,
    spec.queryKeys,
  ]);
}

/**
 * Inverse of `serializeSpec`. Lets a caller hand the registry a spec rebuilt from
 * the key rather than a render-scoped object, which keeps the retaining effect
 * free of a dependency it would otherwise have to suppress.
 */
export function deserializeSpec(specKey: string): RealtimeInvalidationSpec {
  const [typePrefixes, auditActionTypes, queryKeys] = JSON.parse(specKey) as [
    readonly string[] | null,
    readonly string[] | null,
    readonly QueryKey[],
  ];
  return {
    typePrefixes: typePrefixes ?? undefined,
    auditActionTypes: auditActionTypes ?? undefined,
    queryKeys,
  };
}

/**
 * Invalidation rules — unchanged:
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
function specMatches(spec: RealtimeInvalidationSpec, event: RealtimeEvent): boolean {
  switch (event.kind) {
    case "event": {
      const { type, payload } = event.envelope;
      if (type === AUDIT_LOG_TYPE) {
        const actionType = (payload as { actionType?: unknown } | null | undefined)
          ?.actionType;
        return (
          typeof actionType === "string" &&
          spec.auditActionTypes != null &&
          spec.auditActionTypes.includes(actionType)
        );
      }
      return spec.typePrefixes?.some((prefix) => type.startsWith(prefix)) ?? false;
    }
    case "reset":
      return true;
    // keepalive + state carry no domain change — ignore.
    default:
      return false;
  }
}

function dispatch(event: RealtimeEvent): void {
  for (const [queryClient, entries] of holders) {
    // `hashKey` is TanStack's own key identity — the same function the cache uses
    // — so "already invalidated this key" means exactly what the cache means.
    const seen = new Set<string>();
    for (const entry of entries.values()) {
      if (!specMatches(entry.spec, event)) continue;
      for (const queryKey of entry.spec.queryKeys) {
        const hash = hashKey(queryKey);
        if (seen.has(hash)) continue;
        seen.add(hash);
        void queryClient.invalidateQueries({ queryKey });
      }
    }
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
export function retainRealtimeInvalidation(
  queryClient: QueryClient,
  specKey: string,
  spec: RealtimeInvalidationSpec,
): () => void {
  const entries = holders.get(queryClient) ?? new Map<string, Entry>();
  holders.set(queryClient, entries);
  const existing = entries.get(specKey);
  if (existing) {
    existing.count += 1;
  } else {
    // First holder of this spec wins. Safe to keep its object: `specKey` is a
    // canonical serialization, so any later holder is content-equal by definition.
    entries.set(specKey, { count: 1, spec });
  }

  // Re-resolved every retain, not cached once: `__resetDefaultRealtimePortForTests`
  // can swap the singleton, and holding a closure over a dead port would silently
  // stop delivering events.
  const port = getDefaultRealtimePort();
  if (subscribedPort !== port) {
    detachFromPort();
    subscribedPort = port;
    unsubscribeFromPort = port.subscribe(dispatch);
  }

  let released = false;
  return () => {
    // React runs a cleanup once, but a double release would corrupt the refcount
    // and drop the listener while mounts remain — so make it explicit.
    if (released) return;
    released = true;

    const live = holders.get(queryClient);
    const entry = live?.get(specKey);
    if (live && entry) {
      entry.count -= 1;
      if (entry.count <= 0) live.delete(specKey);
      if (live.size === 0) holders.delete(queryClient);
    }
    if (holders.size === 0) detachFromPort();
  };
}

/** Test-only: drop every holder and the shared listener between suites. */
export function __resetRealtimeInvalidationRegistryForTests(): void {
  holders.clear();
  detachFromPort();
}
