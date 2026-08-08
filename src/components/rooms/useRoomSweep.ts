/**
 * Room-sweep state + mutations, extracted from the screen (the useTaskLifecycle
 * precedent) so the sweep flow is testable and the screen stays a thin
 * composition. Owns the worklist query and the three write flows (commit sweep ·
 * not-found-here · bulk verify); the confirm-present checklist state lives in a
 * room-keyed Zustand store (`useRoomSweepStore`) per the client-state guideline.
 *
 * Doctrine:
 *   - The worklist IS the room-contents list (homed-based) — fetched on mount,
 *     not gated behind sweep mode; "start sweep" is a view-state toggle.
 *   - Accuracy-first: resting items start UNconfirmed; the tech confirms
 *     presence (web RoomSweep parity). Checked-out and no-station items are
 *     never toggleable.
 *   - Client state (sweeping · confirmedIds) → Zustand, keyed per room; server
 *     state (worklist · mutations) → TanStack Query. The store entry is cleared
 *     on cancel and on a successful commit.
 *   - Mutations invalidate rooms + docking keys onSettled — the acting client
 *     gets immediate feedback without waiting on the SSE round-trip (the
 *     EquipmentDetail directReturn precedent). SSE covers OTHER clients.
 *   - No setState inside effects (repo lint rule) — all state changes are in
 *     event handlers.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/lib/api/coded-error";
import {
  dockingApi,
  dockingKeys,
  type SweepCommitResult,
  type SweepWorklist,
} from "@/lib/api/docking";
import { roomKeys } from "@/lib/api/rooms";
import { EMPTY_ROOM_SWEEP, useRoomSweepStore } from "@/store/useRoomSweepStore";
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

  // Client checklist state (Zustand) — the store actions are stable references.
  const { sweeping, confirmedIds } = useRoomSweepStore((s) => s.byRoom[roomId] ?? EMPTY_ROOM_SWEEP);
  const startSweepAction = useRoomSweepStore((s) => s.startSweep);
  const resetRoomAction = useRoomSweepStore((s) => s.resetRoom);
  const toggleIdAction = useRoomSweepStore((s) => s.toggleId);
  const confirmIdsAction = useRoomSweepStore((s) => s.confirmIds);
  const clearConfirmedAction = useRoomSweepStore((s) => s.clearConfirmed);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.all });
    void queryClient.invalidateQueries({ queryKey: dockingKeys.all });
  }, [queryClient]);

  const commit = useMutation<SweepCommitResult, Error, void>({
    mutationFn: () => dockingApi.commitSweep(roomId, buildSweepCommitPayload(items, confirmedIds)),
    onSuccess: () => resetRoomAction(roomId),
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
    commit.reset();
    startSweepAction(roomId);
  }, [commit, startSweepAction, roomId]);

  const cancelSweep = useCallback(() => resetRoomAction(roomId), [resetRoomAction, roomId]);

  const toggle = useCallback(
    (id: string) => toggleIdAction(roomId, id),
    [toggleIdAction, roomId],
  );

  const confirmAll = useCallback(
    () => confirmIdsAction(roomId, partition.sweepable.map((item) => item.id)),
    [confirmIdsAction, roomId, partition.sweepable],
  );

  const clearAll = useCallback(
    () => clearConfirmedAction(roomId),
    [clearConfirmedAction, roomId],
  );

  return {
    worklistQuery,
    items,
    sweepable: partition.sweepable,
    noStation: partition.noStation,
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
