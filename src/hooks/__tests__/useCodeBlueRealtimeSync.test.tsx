/**
 * Verifies the subscribe-only Code Blue realtime sync hook — the doctrine this
 * proves: freshness for the read-only viewer comes ONLY from the shared SSE
 * port (never a poll loop), and the advisory KEEPALIVE channel (which carries
 * `activeCodeBlueSessionId`) must NEVER drive invalidation (Operational
 * doctrine: Code Blue is never optimistically terminated/started client-side).
 *
 * Mirrors `useEquipmentRealtimeSync.test.tsx`. Sharing/refcount mechanics are
 * the registry's own concern (already covered there and in
 * `realtime-invalidation-registry` tests) — this file only proves the
 * Code Blue spec matches the right things and stays silent on the wrong ones.
 */
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { RealtimeEvent, RealtimePort } from "@/core/ports/realtime.port";
import { codeBlueKeys } from "@/lib/api/code-blue";

import { __resetRealtimeInvalidationRegistryForTests } from "../realtime-invalidation-registry";
import { useCodeBlueRealtimeSync } from "../useCodeBlueRealtimeSync";

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

function emit(event: RealtimeEvent): void {
  for (const listener of [...listeners]) listener(event);
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCodeBlueRealtimeSync", () => {
  beforeEach(() => {
    __resetRealtimeInvalidationRegistryForTests();
    listeners.length = 0;
    unsubscribe.mockClear();
    openSpy.mockClear();
    closeSpy.mockClear();
  });

  async function setup() {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const view = await renderHook(() => useCodeBlueRealtimeSync(), {
      wrapper: makeWrapper(queryClient),
    });
    // Guard against a vacuous pass.
    expect(listeners).toHaveLength(1);
    return { queryClient, invalidateSpy, view };
  }

  it("invalidates the active-session key on a CODE_BLUE_* domain event (session start/end)", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "CODE_BLUE_STATUS_CHANGED", payload: { status: "active" }, timestamp: "t" },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: codeBlueKeys.active() });
  });

  it("invalidates on a code_blue_log_entry_created audit_log event", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: {
        type: "audit_log",
        payload: { actionType: "code_blue_log_entry_created" },
        timestamp: "t",
      },
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: codeBlueKeys.active() });
  });

  it("invalidates on reset (pruned-cursor resync)", async () => {
    const { invalidateSpy } = await setup();
    emit({ kind: "reset", reason: "last_event_pruned" });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: codeBlueKeys.active() });
  });

  it("does NOT invalidate on keepalive, even though it carries activeCodeBlueSessionId", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "keepalive",
      keepalive: { activeCodeBlueSessionId: "cb1", stormHint: "none" },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate on a presence heartbeat (10s/participant — would churn refetches)", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: {
        type: "audit_log",
        payload: { actionType: "code_blue_presence_heartbeat" },
        timestamp: "t",
      },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("ignores unrelated events and state changes", async () => {
    const { invalidateSpy } = await setup();
    emit({
      kind: "event",
      envelope: { type: "EQUIPMENT_CUSTODY_STATE_CHANGED", payload: {}, timestamp: "t" },
    });
    emit({
      kind: "event",
      envelope: { type: "audit_log", payload: { actionType: "alert_seen" }, timestamp: "t" },
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
});
