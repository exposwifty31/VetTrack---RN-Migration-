/**
 * Room-sweep CLIENT state (Zustand — the Anchor's mandated client-state layer;
 * server state stays in TanStack Query). The sweep checklist is genuine
 * interaction state (which resting items the tech has confirmed present, and
 * whether the checklist is open), keyed per room so two rooms never share a
 * selection and the state survives a component unmount mid-sweep.
 *
 * The worklist itself and the write mutations live in `useRoomSweep` on
 * TanStack Query — this store holds ONLY `{ sweeping, confirmedIds }`. The
 * room's entry is cleared on cancel and on a successful commit (so nothing
 * leaks across rooms or lingers after the flow ends).
 */
import { create } from "zustand";

export type RoomSweepState = Readonly<{
  /** The confirm-present checklist is open. */
  sweeping: boolean;
  /** Ids the tech has confirmed present (resting items only). */
  confirmedIds: ReadonlySet<string>;
}>;

/** Stable default for rooms with no active sweep — a single shared reference. */
export const EMPTY_ROOM_SWEEP: RoomSweepState = { sweeping: false, confirmedIds: new Set() };

type RoomSweepStore = Readonly<{
  byRoom: Readonly<Record<string, RoomSweepState>>;
  /** Open a fresh checklist (accuracy-first: nothing pre-confirmed). */
  startSweep: (roomId: string) => void;
  /** Clear the room's entry — used on cancel AND on a successful commit. */
  resetRoom: (roomId: string) => void;
  /** Flip one id's confirmed state. */
  toggleId: (roomId: string, id: string) => void;
  /** Confirm every id (Mark all present). */
  confirmIds: (roomId: string, ids: readonly string[]) => void;
  /** Clear the checklist but keep the sweep open (Clear). */
  clearConfirmed: (roomId: string) => void;
}>;

function patchRoom(
  byRoom: Readonly<Record<string, RoomSweepState>>,
  roomId: string,
  next: RoomSweepState,
): Record<string, RoomSweepState> {
  return { ...byRoom, [roomId]: next };
}

function withoutRoom(
  byRoom: Readonly<Record<string, RoomSweepState>>,
  roomId: string,
): Record<string, RoomSweepState> {
  if (byRoom[roomId] === undefined) return byRoom as Record<string, RoomSweepState>;
  const next = { ...byRoom };
  delete next[roomId];
  return next;
}

export const useRoomSweepStore = create<RoomSweepStore>((set) => ({
  byRoom: {},

  startSweep: (roomId) =>
    set((s) => ({ byRoom: patchRoom(s.byRoom, roomId, { sweeping: true, confirmedIds: new Set() }) })),

  resetRoom: (roomId) => set((s) => ({ byRoom: withoutRoom(s.byRoom, roomId) })),

  toggleId: (roomId, id) =>
    set((s) => {
      const cur = s.byRoom[roomId] ?? EMPTY_ROOM_SWEEP;
      const confirmedIds = new Set(cur.confirmedIds);
      if (confirmedIds.has(id)) confirmedIds.delete(id);
      else confirmedIds.add(id);
      return { byRoom: patchRoom(s.byRoom, roomId, { sweeping: cur.sweeping, confirmedIds }) };
    }),

  confirmIds: (roomId, ids) =>
    set((s) => {
      const cur = s.byRoom[roomId] ?? EMPTY_ROOM_SWEEP;
      return {
        byRoom: patchRoom(s.byRoom, roomId, { sweeping: cur.sweeping, confirmedIds: new Set(ids) }),
      };
    }),

  clearConfirmed: (roomId) =>
    set((s) => {
      const cur = s.byRoom[roomId] ?? EMPTY_ROOM_SWEEP;
      return {
        byRoom: patchRoom(s.byRoom, roomId, { sweeping: cur.sweeping, confirmedIds: new Set() }),
      };
    }),
}));
