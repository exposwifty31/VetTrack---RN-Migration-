/**
 * Locks the generic invalidation hook's doctrine: typePrefix match + audit_log
 * actionType filter + reset all invalidate every given key; keepalive and
 * state NEVER invalidate; the hook never opens/closes the port.
 */
import type { ReactNode } from "react";
import { render, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { RealtimeEvent, RealtimePort } from "@/core/ports/realtime.port";

import { __resetRealtimeInvalidationRegistryForTests } from "../realtime-invalidation-registry";
import {
  useRealtimeInvalidation,
  type UseRealtimeInvalidationOptions,
} from "../useRealtimeInvalidation";

/**
 * Collected as an ARRAY, not a single slot: the sharing tests count listeners,
 * and a single slot would silently overwrite the second registration and hide
 * the very duplication under test.
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

const DEFAULT_OPTIONS: UseRealtimeInvalidationOptions = {
  typePrefixes: ["ROOM_"],
  auditActionTypes: ["shift_handover_generated"],
  queryKeys: [["rooms"], ["handoff", "latest"]],
};

/** The iPad two-pane pair: RoomsScreen and RoomDetailContent overlap on `["rooms"]`. */
const ROOMS_MASTER: UseRealtimeInvalidationOptions = {
  typePrefixes: ["ROOM_"],
  queryKeys: [["rooms"]],
};
const ROOMS_DETAIL: UseRealtimeInvalidationOptions = {
  typePrefixes: ["ROOM_"],
  queryKeys: [["rooms"], ["docking"]],
};

function Consumer({ options }: { options: UseRealtimeInvalidationOptions }) {
  useRealtimeInvalidation(options);
  return null;
}

describe("useRealtimeInvalidation", () => {
  beforeEach(() => {
    // The registry is module state. A holder leaked from an earlier test would
    // suppress the next `subscribe()`, leaving `listeners` empty and turning every
    // `not.toHaveBeenCalled()` below into a vacuous pass.
    __resetRealtimeInvalidationRegistryForTests();
    listeners.length = 0;
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
    expect(listeners).toHaveLength(1);
    return { queryClient, invalidateSpy, view };
  }

  it("invalidates every given key on a typePrefix-matching event", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "ROOM_OCCUPANCY_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rooms"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["handoff", "latest"] });
  });

  it("ignores events matching no prefix", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates on audit_log with an allowlisted actionType", async () => {
    const { invalidateSpy } = await setup();
    emit({
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
    emit({
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
    emit({
      kind: "event",
      envelope: { type: "audit_log", payload: { actionType: "anything" }, timestamp: "t" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates every given key on reset", async () => {
    const { invalidateSpy } = await setup();
    emit({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT invalidate on keepalive", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "none" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate on state changes", async () => {
    const { invalidateSpy } = await setup();
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

  it("three mounts of the SAME spec share ONE listener and invalidate each key once", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await render(
      <QueryClientProvider client={queryClient}>
        <Consumer options={ROOMS_MASTER} />
        <Consumer options={ROOMS_MASTER} />
        <Consumer options={ROOMS_MASTER} />
      </QueryClientProvider>,
    );

    expect(listeners).toHaveLength(1);
    emit({
      kind: "event",
      envelope: { type: "ROOM_OCCUPANCY_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rooms"] });
  });

  it("invalidates a key shared by two DIFFERENT specs exactly once", async () => {
    // The real iPad two-pane pair: RoomsScreen `[["rooms"]]` and RoomDetailContent
    // `[["rooms"],["docking"]]` mount together. Deduping by spec alone would still
    // hit `["rooms"]` twice — the dedupe has to be per query key.
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await render(
      <QueryClientProvider client={queryClient}>
        <Consumer options={ROOMS_MASTER} />
        <Consumer options={ROOMS_DETAIL} />
      </QueryClientProvider>,
    );

    expect(listeners).toHaveLength(1);
    emit({
      kind: "event",
      envelope: { type: "ROOM_OCCUPANCY_CHANGED", payload: {}, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rooms"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["docking"] });
  });

  it("keeps the shared listener alive until the LAST mount unmounts", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const view = await render(
      <QueryClientProvider client={queryClient}>
        <Consumer options={ROOMS_MASTER} />
        <Consumer options={ROOMS_DETAIL} />
      </QueryClientProvider>,
    );

    // The detail pane collapses because its row left the data.
    await view.rerender(
      <QueryClientProvider client={queryClient}>
        <Consumer options={ROOMS_MASTER} />
      </QueryClientProvider>,
    );

    expect(unsubscribe).not.toHaveBeenCalled();
    emit({ kind: "reset", reason: "last_event_pruned" });
    // `["docking"]` left with the detail pane — only the master's key remains.
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rooms"] });

    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
