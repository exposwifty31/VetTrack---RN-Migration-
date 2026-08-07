/**
 * Locks the generic invalidation hook's doctrine: typePrefix match + audit_log
 * actionType filter + reset all invalidate every given key; keepalive and
 * state NEVER invalidate; the hook never opens/closes the port.
 */
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { RealtimeEvent, RealtimePort } from "@/core/ports/realtime.port";

import {
  useRealtimeInvalidation,
  type UseRealtimeInvalidationOptions,
} from "../useRealtimeInvalidation";

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

const DEFAULT_OPTIONS: UseRealtimeInvalidationOptions = {
  typePrefixes: ["ROOM_"],
  auditActionTypes: ["shift_handover_generated"],
  queryKeys: [["rooms"], ["handoff", "latest"]],
};

describe("useRealtimeInvalidation", () => {
  beforeEach(() => {
    capturedListener = null;
    unsubscribe.mockClear();
    openSpy.mockClear();
    closeSpy.mockClear();
  });

  async function setup(options: UseRealtimeInvalidationOptions = DEFAULT_OPTIONS) {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const view = await renderHook(() => useRealtimeInvalidation(options), {
      wrapper: makeWrapper(queryClient),
    });
    return { queryClient, invalidateSpy, view };
  }

  it("invalidates every given key on a typePrefix-matching event", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: { type: "ROOM_OCCUPANCY_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rooms"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["handoff", "latest"] });
  });

  it("ignores events matching no prefix", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates on audit_log with an allowlisted actionType", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: {
        type: "audit_log",
        payload: { actionType: "shift_handover_generated", auditLogId: "a1" },
        timestamp: "t",
      },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores audit_log with a non-allowlisted actionType", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "event",
      envelope: {
        type: "audit_log",
        payload: { actionType: "equipment_checked_out" },
        timestamp: "t",
      },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("never routes audit_log through typePrefixes (and no auditActionTypes → no invalidate)", async () => {
    const { invalidateSpy } = await setup({
      typePrefixes: ["audit"],
      queryKeys: [["rooms"]],
    });
    capturedListener?.({
      kind: "event",
      envelope: { type: "audit_log", payload: { actionType: "anything" }, timestamp: "t" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates every given key on reset", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT invalidate on keepalive", async () => {
    const { invalidateSpy } = await setup();
    capturedListener?.({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "none" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate on state changes", async () => {
    const { invalidateSpy } = await setup();
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
