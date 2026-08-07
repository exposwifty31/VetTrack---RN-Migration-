/**
 * Locks the day-state contract: mount captures the local today; an AppState
 * foreground transition after a calendar rollover refreshes "today" and
 * advances the SELECTED day only when it was pinned to the previous today —
 * manually chosen days never move. Clock state only: no timers, no data
 * polling.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { useTaskDay } from "../useTaskDay";

// useTaskDay → datetime → @/i18n → safe-storage hits the MMKV native module,
// absent under jest — mock the helpers (the datetime.test.ts pattern; jest
// hoists the mock above the imports).
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(() => true),
  safeStorageRemoveItem: jest.fn(() => true),
}));

type AppStateHandler = (state: string) => void;

describe("useTaskDay", () => {
  let handler: AppStateHandler | null = null;
  let nowSpy: jest.SpyInstance<number, []>;
  const remove = jest.fn();

  // Local-noon instants keep isoDayString assertions TZ-independent.
  const AUG_7 = new Date(2026, 7, 7, 12, 0, 0).getTime();
  const AUG_8 = new Date(2026, 7, 8, 0, 30, 0).getTime();

  beforeEach(() => {
    handler = null;
    remove.mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      handler = listener as AppStateHandler;
      return { remove } as ReturnType<typeof AppState.addEventListener>;
    });
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(AUG_7);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("captures the local today at mount and starts on it", async () => {
    const { result } = await renderHook(() => useTaskDay());
    expect(result.current.today).toBe("2026-08-07");
    expect(result.current.day).toBe("2026-08-07");
    expect(result.current.isToday).toBe(true);
  });

  it("keeps state stable on foreground within the same day", async () => {
    const { result } = await renderHook(() => useTaskDay());
    await act(() => handler?.("active"));
    expect(result.current.today).toBe("2026-08-07");
    expect(result.current.day).toBe("2026-08-07");
  });

  it("ignores non-active transitions", async () => {
    const { result } = await renderHook(() => useTaskDay());
    nowSpy.mockReturnValue(AUG_8);
    await act(() => handler?.("background"));
    expect(result.current.today).toBe("2026-08-07");
  });

  it("advances today AND a today-pinned selection on foreground after rollover", async () => {
    const { result } = await renderHook(() => useTaskDay());
    nowSpy.mockReturnValue(AUG_8);
    await act(() => handler?.("active"));
    expect(result.current.today).toBe("2026-08-08");
    expect(result.current.day).toBe("2026-08-08");
    expect(result.current.isToday).toBe(true);
  });

  it("preserves a manually selected day across the rollover", async () => {
    const { result } = await renderHook(() => useTaskDay());
    await act(() => result.current.setDay("2026-08-05"));
    nowSpy.mockReturnValue(AUG_8);
    await act(() => handler?.("active"));
    expect(result.current.today).toBe("2026-08-08");
    expect(result.current.day).toBe("2026-08-05");
    expect(result.current.isToday).toBe(false);
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = await renderHook(() => useTaskDay());
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
