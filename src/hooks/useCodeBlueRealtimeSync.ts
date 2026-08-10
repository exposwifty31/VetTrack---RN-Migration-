/**
 * Live Code Blue active-session state WITHOUT polling — subscribe-only to the
 * shared SSE port, the `useEquipmentRealtimeSync` idiom applied to Code Blue.
 *
 * FROZEN SURFACE (hard): this hook NEVER opens/closes the stream (RealtimeBridge
 * owns the lifecycle on AppState + auth), NEVER constructs an event source, and
 * NEVER polls. It only `subscribe()`s to `getDefaultRealtimePort()` and
 * invalidates `codeBlueKeys.active()`.
 *
 * Matches on:
 *   - `CODE_BLUE_*` domain events (`CODE_BLUE_STATUS_CHANGED` on session
 *     start/end — `insertRealtimeDomainEvent` in `server/routes/code-blue.ts`).
 *   - `audit_log` rows with actionType `code_blue_log_entry_created`.
 * Deliberately EXCLUDES `code_blue_presence_heartbeat` (see
 * `CODE_BLUE_AUDIT_ACTION_TYPES` doc comment in `lib/api/code-blue.ts`) and the
 * advisory KEEPALIVE channel (`activeCodeBlueSessionId` never drives
 * invalidation — Code Blue state is server-confirmed only, never guessed).
 */
import {
  CODE_BLUE_AUDIT_ACTION_TYPES,
  CODE_BLUE_EVENT_TYPE_PREFIXES,
  codeBlueKeys,
} from "@/lib/api/code-blue";

import {
  useRealtimeInvalidation,
  type UseRealtimeInvalidationOptions,
} from "./useRealtimeInvalidation";

const CODE_BLUE_SPEC: UseRealtimeInvalidationOptions = {
  typePrefixes: CODE_BLUE_EVENT_TYPE_PREFIXES,
  auditActionTypes: CODE_BLUE_AUDIT_ACTION_TYPES,
  queryKeys: [codeBlueKeys.active()],
};

export function useCodeBlueRealtimeSync(): void {
  useRealtimeInvalidation(CODE_BLUE_SPEC);
}
