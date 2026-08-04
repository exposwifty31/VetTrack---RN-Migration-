/**
 * Verifies the subscribe-only realtime sync hook: it invalidates the canonical
 * `['equipment']` key on `EQUIPMENT_*` domain events and on `reset` (pruned-cursor
 * resync), and stays SILENT on `keepalive` (which carries activeCodeBlueSessionId
 * and must never invalidate) and `state`. The hook must never open/close the port.
 */
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { RealtimeEvent, RealtimePort } from "@/core/ports/realtime.port";

import { useEquipmentRealtimeSync } from "../useEquipmentRealtimeSync";

let capturedListener: ((event: RealtimeEvent) => void) | null = null;
const unsubscribe = jest.fn();
const openSpy = jest.fn();
const closeSpy = jest.fn();

const fakePort: RealtimePort = {
  open: openSpy,
  close: closeSpy,
  getCursor: () => 0,
  getState: () => "idle",
  subscribe: (listener) => {
    capturedListener = listener;
    return unsubscribe;
  },
};

jest.mock("@/infrastructure/realtime/defaultRealtime", () => ({
  getDefaultRealtimePort: () => fakePort,
}));

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useEquipmentRealtimeSync", () => {
  beforeEach(() => {
    capturedListener = null;
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
    return { queryClient, invalidateSpy, view };
  }

  it("invalidates ['equipment'] on an EQUIPMENT_* event", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment"] });
  });

  it("invalidates ['equipment'] on reset", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment"] });
  });

  it("does NOT invalidate on keepalive", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "none" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("ignores non-EQUIPMENT_ events and state changes", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: { type: "CODE_BLUE_STARTED", payload: {}, timestamp: "t" },
    });
    capturedListener?.({ kind: "state", state: "open" });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("subscribes only — never opens or closes the port, and unsubscribes on unmount", async () => {
    const { view } = await setup();
    expect(openSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
