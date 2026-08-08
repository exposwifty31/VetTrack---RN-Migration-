/**
 * Room-sweep client store (Zustand) — locks the checklist reducer that the
 * sweep flow depends on: per-room isolation, toggle/confirm/clear, and the
 * clear-on-cancel / clear-on-commit contract (no per-room leak after the flow
 * ends). Pure store logic — no React tree needed.
 */
import { EMPTY_ROOM_SWEEP, useRoomSweepStore } from "../useRoomSweepStore";

const store = () => useRoomSweepStore.getState();
const room = (id: string) => useRoomSweepStore.getState().byRoom[id] ?? EMPTY_ROOM_SWEEP;

beforeEach(() => {
  useRoomSweepStore.setState({ byRoom: {} });
});

describe("useRoomSweepStore", () => {
  it("defaults an untouched room to the shared empty state", () => {
    expect(room("r1")).toBe(EMPTY_ROOM_SWEEP);
    expect(room("r1").sweeping).toBe(false);
    expect([...room("r1").confirmedIds]).toEqual([]);
  });

  it("startSweep opens a fresh checklist", () => {
    store().startSweep("r1");
    expect(room("r1").sweeping).toBe(true);
    expect([...room("r1").confirmedIds]).toEqual([]);
  });

  it("toggleId flips a single id without touching sweeping", () => {
    store().startSweep("r1");
    store().toggleId("r1", "eq-1");
    expect([...room("r1").confirmedIds]).toEqual(["eq-1"]);
    store().toggleId("r1", "eq-1");
    expect([...room("r1").confirmedIds]).toEqual([]);
    expect(room("r1").sweeping).toBe(true);
  });

  it("confirmIds sets the whole checklist; clearConfirmed empties it but keeps sweeping", () => {
    store().startSweep("r1");
    store().confirmIds("r1", ["a", "b", "c"]);
    expect([...room("r1").confirmedIds].sort()).toEqual(["a", "b", "c"]);
    store().clearConfirmed("r1");
    expect([...room("r1").confirmedIds]).toEqual([]);
    expect(room("r1").sweeping).toBe(true);
  });

  it("resetRoom clears the entry entirely (cancel + successful commit)", () => {
    store().startSweep("r1");
    store().confirmIds("r1", ["a"]);
    store().resetRoom("r1");
    // No lingering per-room entry — falls back to the shared empty default.
    expect(useRoomSweepStore.getState().byRoom.r1).toBeUndefined();
    expect(room("r1")).toBe(EMPTY_ROOM_SWEEP);
  });

  it("keeps rooms isolated from one another", () => {
    store().startSweep("r1");
    store().toggleId("r1", "eq-1");
    store().startSweep("r2");
    store().toggleId("r2", "eq-2");
    expect([...room("r1").confirmedIds]).toEqual(["eq-1"]);
    expect([...room("r2").confirmedIds]).toEqual(["eq-2"]);
    store().resetRoom("r1");
    expect(room("r1")).toBe(EMPTY_ROOM_SWEEP);
    expect([...room("r2").confirmedIds]).toEqual(["eq-2"]);
  });
});
