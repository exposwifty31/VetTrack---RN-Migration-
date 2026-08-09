/**
 * Verifies the subscribe-only realtime sync hook: it invalidates the canonical
 * `['equipment']` key on `EQUIPMENT_*` domain events and on `reset` (pruned-cursor
 * resync), and stays SILENT on `keepalive` (which carries activeCodeBlueSessionId
 * and must never invalidate) and `state`. The hook must never open/close the port.
 *
 * It also locks the SHARING contract: the hook is mounted by five screens at once
 * (Home, Equipment list, Equipment detail, My equipment, Alerts — and the iPad
 * two-pane shows list + detail simultaneously), so N mounts must produce ONE port
 * listener and ONE invalidation per event.
 */
import type { ReactNode } from "react";
import { render, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { RealtimeEvent, RealtimePort } from "@/core/ports/realtime.port";

import { __resetEquipmentRealtimeRegistryForTests } from "../equipment-realtime-registry";
import { useEquipmentRealtimeSync } from "../useEquipmentRealtimeSync";

/**
 * Collected as an ARRAY, not a single slot: the point of the sharing test is to
 * count listeners, and a single `capturedListener` slot would silently overwrite
 * the second registration and hide the very duplication under test.
 */
const listeners: ((event: RealtimeEvent) => void)[] = [];
const unsubscribe = jest.fn();
const openSpy = jest.fn();
const closeSpy = jest.fn();

const fakePort: RealtimePort = {
  open: openSpy,
  close: closeSpy,
  getCursor: () => 0,
  getState: () => "idle",
  subscribe: (listener) => {
    listeners.push(listener);
    return unsubscribe;
  },
};

jest.mock("@/infrastructure/realtime/defaultRealtime", () => ({
  getDefaultRealtimePort: () => fakePort,
}));

/** Fan an event out exactly as SseAdapter does — to every registered listener. */
function emit(event: RealtimeEvent): void {
  for (const listener of [...listeners]) listener(event);
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function Consumer() {
  useEquipmentRealtimeSync();
  return null;
}

describe("useEquipmentRealtimeSync", () => {
  beforeEach(() => {
    // The registry is module state. A holder leaked from an earlier test would
    // suppress the next `subscribe()`, leaving `listeners` empty and turning every
    // `not.toHaveBeenCalled()` below into a vacuous pass.
    __resetEquipmentRealtimeRegistryForTests();
    listeners.length = 0;
    unsubscribe.mockClear();
    openSpy.mockClear();
    closeSpy.mockClear();
  });

  async function setup() {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const view = await renderHook(() => useEquipmentRealtimeSync(), {
      wrapper: makeWrapper(queryClient),
    });
    // Guard against a vacuous pass: every `not.toHaveBeenCalled()` below would go
    // green if nothing had subscribed and `emit` were a no-op.
    expect(listeners).toHaveLength(1);
    return { queryClient, invalidateSpy, view };
  }

  it("invalidates ['equipment'] on an EQUIPMENT_* event", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment"] });
  });

  it("invalidates ['equipment'] on reset", async () => {
    const { invalidateSpy } = await setup();
    emit({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment"] });
  });

  it("does NOT invalidate on keepalive", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "none" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("ignores non-EQUIPMENT_ events and state changes", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "CODE_BLUE_STARTED", payload: {}, timestamp: "t" },
    });
    emit({ kind: "state", state: "open" });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("subscribes only — never opens or closes the port, and unsubscribes on unmount", async () => {
    const { view } = await setup();
    expect(openSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("three simultaneous mounts share ONE listener and invalidate ONCE per event", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await render(
      <QueryClientProvider client={queryClient}>
        <Consumer />
        <Consumer />
        <Consumer />
      </QueryClientProvider>,
    );

    expect(listeners).toHaveLength(1);
    emit({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared listener alive until the LAST mount unmounts", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    // The iPad two-pane case: master list + detail pane mounted together, then the
    // detail pane collapses because its row left the data.
    const view = await render(
      <QueryClientProvider client={queryClient}>
        <Consumer />
        <Consumer />
      </QueryClientProvider>,
    );

    await view.rerender(
      <QueryClientProvider client={queryClient}>
        <Consumer />
      </QueryClientProvider>,
    );

    expect(unsubscribe).not.toHaveBeenCalled();
    emit({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
