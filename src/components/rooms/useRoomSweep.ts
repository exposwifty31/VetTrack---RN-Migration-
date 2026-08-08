/**
 * Room-sweep state + mutations, extracted from the screen (the useTaskLifecycle
 * precedent) so the sweep flow is testable and the screen stays a thin
 * composition. Owns the worklist query, the confirm-present checklist state,
 * and the three write flows (commit sweep · not-found-here · bulk verify).
 *
 * Doctrine:
 *   - The worklist IS the room-contents list (homed-based) — fetched on mount,
 *     not gated behind sweep mode; "start sweep" is a view-state toggle.
 *   - Accuracy-first: resting items start UNconfirmed; the tech confirms
 *     presence (web RoomSweep parity). Checked-out items are never toggleable.
 *   - Mutations invalidate rooms + docking keys onSettled — the acting client
 *     gets immediate feedback without waiting on the SSE round-trip (the
 *     EquipmentDetail directReturn precedent). SSE covers OTHER clients.
 *   - No setState inside effects (repo lint rule) — all state changes are in
 *     event handlers.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/lib/api/coded-error";
import {
  dockingApi,
  dockingKeys,
  type SweepCommitResult,
  type SweepWorklist,
} from "@/lib/api/docking";
import { roomKeys } from "@/lib/api/rooms";
import { buildSweepCommitPayload, partitionSweepItems } from "./rooms-derive";

export type UseRoomSweep = ReturnType<typeof useRoomSweep>;

export function useRoomSweep(roomId: string) {
  const queryClient = useQueryClient();

  const worklistQuery = useQuery<SweepWorklist, Error>({
    queryKey: dockingKeys.sweep(roomId),
    queryFn: () => dockingApi.getSweep(roomId),
    retry: retryUnlessClientError,
  });

  const items = useMemo(() => worklistQuery.data?.items ?? [], [worklistQuery.data]);
  const partition = useMemo(() => partitionSweepItems(items), [items]);

  const [sweeping, setSweeping] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<string>>(() => new Set());

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.all });
    void queryClient.invalidateQueries({ queryKey: dockingKeys.all });
  }, [queryClient]);

  const commit = useMutation<SweepCommitResult, Error, void>({
    mutationFn: () => dockingApi.commitSweep(roomId, buildSweepCommitPayload(items, confirmedIds)),
    onSuccess: () => {
      setSweeping(false);
      setConfirmedIds(new Set());
    },
    onSettled: invalidate,
  });

  const notFound = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (equipmentId) => dockingApi.notFoundHere(equipmentId),
    onSettled: invalidate,
  });

  const bulkVerify = useMutation<unknown, Error, void>({
    mutationFn: () => dockingApi.bulkVerifyRoom(roomId),
    onSettled: invalidate,
  });

  const startSweep = useCallback(() => {
    // Fresh checklist every entry — accuracy-first, nothing pre-confirmed.
    setConfirmedIds(new Set());
    commit.reset();
    setSweeping(true);
  }, [commit]);

  const cancelSweep = useCallback(() => {
    setSweeping(false);
    setConfirmedIds(new Set());
  }, []);

  const toggle = useCallback((id: string) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmAll = useCallback(() => {
    setConfirmedIds(new Set(partition.sweepable.map((item) => item.id)));
  }, [partition.sweepable]);

  const clearAll = useCallback(() => {
    setConfirmedIds(new Set());
  }, []);

  return {
    worklistQuery,
    items,
    sweepable: partition.sweepable,
    accounted: partition.accounted,
    sweeping,
    confirmedIds,
    startSweep,
    cancelSweep,
    toggle,
    confirmAll,
    clearAll,
    commit,
    /** The id whose not-found-here mutation is in flight (for a per-row spinner). */
    notFoundPendingId: notFound.isPending ? notFound.variables ?? null : null,
    reportNotFound: (equipmentId: string) => notFound.mutate(equipmentId),
    notFoundError: notFound.isError,
    bulkVerify,
  };
}
