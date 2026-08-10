/**
 * Code Blue MUTATION control (G4-5) — start / log / end / presence.
 *
 * Doctrine, mirrored from `useTaskMutations.ts` (the repo's PLAIN-invalidate
 * precedent) and hardened for the emergency-mutation contract:
 *   - NO optimistic local writes anywhere in this file (no `onMutate`, no
 *     `queryClient.setQueryData`). Every mutation's `onSuccess` does exactly
 *     one thing — invalidate `codeBlueKeys.active()` — which schedules a REAL
 *     refetch against the server. That refetch (or the SSE-driven one from
 *     `useCodeBlueRealtimeSync`) is the ONLY path by which the UI can ever
 *     observe a session as ended. This is what makes "session end is
 *     server-confirmed, never optimistic" true structurally, not by
 *     convention.
 *   - Every `mutationFn` here is a `codeBlueApi.*` call, which goes through
 *     `authFetch` -> the emergency-block classifier. A network-level failure
 *     on any of these four endpoints throws `EmergencyOfflineError` instead
 *     of the raw network error (see `emergency-block.ts`); this hook does
 *     NOT catch it, so it propagates to `.error` untouched. No `retry`
 *     override is set, so react-query's own default retry never turns an
 *     offline attempt into a queued/replayed one.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import type { EndSessionRequest, LogEntryRequest, StartCodeBlueRequest } from "@/types/code-blue";

export function useCodeBlueMutations() {
  const queryClient = useQueryClient();
  const invalidateActive = () => queryClient.invalidateQueries({ queryKey: codeBlueKeys.active() });

  const start = useMutation({
    mutationFn: (payload: StartCodeBlueRequest) => codeBlueApi.start(payload),
    onSuccess: invalidateActive,
  });

  const addLogEntry = useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: string; payload: LogEntryRequest }) =>
      codeBlueApi.addLogEntry(sessionId, payload),
    onSuccess: invalidateActive,
  });

  /**
   * Close-out. `onSuccess` invalidates `codeBlueKeys.active()` exactly like
   * every other mutation here — there is deliberately no special-cased
   * "mark ended" branch. The active-session query naturally returns
   * `session: null` once the server has actually committed the end (GET
   * /sessions/active only ever returns an active row), so the UI's "no
   * active session" transition IS the server confirmation, never a locally
   * guessed one.
   */
  const end = useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: string; payload: EndSessionRequest }) =>
      codeBlueApi.end(sessionId, payload),
    onSuccess: invalidateActive,
  });

  const presence = useMutation({
    mutationFn: (sessionId: string) => codeBlueApi.presence(sessionId),
    onSuccess: invalidateActive,
  });

  return { start, addLogEntry, end, presence };
}
