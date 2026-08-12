/**
 * G4-5 — doctrine tests for the Code Blue mutation hooks.
 *
 * The two non-negotiable guarantees under test:
 *   1. Offline attempt: `codeBlueApi.*` rejects with `EmergencyOfflineError`
 *      (proven at the transport layer already, `auth-fetch.emergency.test.ts`)
 *      -> the hook surfaces that SAME error instance on `.error`, untouched —
 *      never swallowed, never re-wrapped, never silently retried.
 *   2. Session end is SERVER-CONFIRMED, never optimistic: no mutation here
 *      ever calls `queryClient.setQueryData` — the ONLY way the cache changes
 *      is `invalidateQueries` after a genuine server round-trip succeeds.
 *
 * `codeBlueApi` is mocked so these tests exercise the hook wiring in
 * isolation (transport-layer offline-block behavior is covered elsewhere).
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EmergencyOfflineError } from "@/lib/emergency-block";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";

import { useCodeBlueMutations } from "../useCodeBlueMutations";

jest.mock("@/lib/api/code-blue", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/code-blue")>("@/lib/api/code-blue");
  return {
    ...actual,
    codeBlueApi: {
      active: jest.fn(),
      start: jest.fn(),
      addLogEntry: jest.fn(),
      end: jest.fn(),
      presence: jest.fn(),
    },
  };
});

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

async function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const setQueryDataSpy = jest.spyOn(queryClient, "setQueryData");
  const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const view = await renderHook(() => useCodeBlueMutations(), { wrapper: makeWrapper(queryClient) });
  return { queryClient, setQueryDataSpy, invalidateSpy, view };
}

afterEach(() => jest.clearAllMocks());

describe("useCodeBlueMutations — offline fails loud, untouched", () => {
  it("start: EmergencyOfflineError from the api layer surfaces as-is on the mutation", async () => {
    const offlineErr = new EmergencyOfflineError("start", "/api/code-blue/sessions", "POST");
    jest.mocked(codeBlueApi.start).mockRejectedValue(offlineErr);
    const { view, invalidateSpy } = await setup();

    await act(async () => {
      view.result.current.start.mutate({ managerUserId: "u1", managerUserName: "Dr. Cohen" });
    });
    await waitFor(() => expect(view.result.current.start.isError).toBe(true));

    expect(view.result.current.start.error).toBe(offlineErr); // same instance — not re-wrapped
    // No local queue/replay: the mutation ran exactly once, no retry-driven invalidation.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("addLogEntry / end / presence: EmergencyOfflineError surfaces as-is for each", async () => {
    const cases = [
      {
        cls: "log" as const,
        fn: codeBlueApi.addLogEntry,
        act: (h: ReturnType<typeof useCodeBlueMutations>) =>
          h.addLogEntry.mutate({
            sessionId: "s-1",
            payload: { idempotencyKey: "k1", elapsedMs: 0, label: "note", category: "note" },
          }),
        pick: (h: ReturnType<typeof useCodeBlueMutations>) => h.addLogEntry,
      },
      {
        cls: "end" as const,
        fn: codeBlueApi.end,
        act: (h: ReturnType<typeof useCodeBlueMutations>) =>
          h.end.mutate({ sessionId: "s-1", payload: { outcome: "rosc" } }),
        pick: (h: ReturnType<typeof useCodeBlueMutations>) => h.end,
      },
      {
        cls: "presence" as const,
        fn: codeBlueApi.presence,
        act: (h: ReturnType<typeof useCodeBlueMutations>) => h.presence.mutate("s-1"),
        pick: (h: ReturnType<typeof useCodeBlueMutations>) => h.presence,
      },
    ];

    for (const { cls, fn, act: trigger, pick } of cases) {
      const offlineErr = new EmergencyOfflineError(cls, "/api/code-blue/sessions/s-1", "POST");
      jest.mocked(fn).mockRejectedValueOnce(offlineErr);
      const { view } = await setup();

      await act(async () => {
        trigger(view.result.current);
      });
      await waitFor(() => expect(pick(view.result.current).isError).toBe(true));

      expect(pick(view.result.current).error).toBe(offlineErr);
    }
  });
});

describe("useCodeBlueMutations — end is server-confirmed, never optimistic", () => {
  it("end success NEVER calls setQueryData — only invalidateQueries (real server round-trip)", async () => {
    jest.mocked(codeBlueApi.end).mockResolvedValue({ id: "s-1", endedAt: "2026-08-10T12:00:00.000Z", summary: {} });
    const { view, setQueryDataSpy, invalidateSpy } = await setup();

    await act(async () => {
      view.result.current.end.mutate({ sessionId: "s-1", payload: { outcome: "rosc" } });
    });
    await waitFor(() => expect(view.result.current.end.isSuccess).toBe(true));

    expect(setQueryDataSpy).not.toHaveBeenCalled(); // no locally-constructed "ended" cache write
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: codeBlueKeys.active() });
  });

  it("start / addLogEntry / presence success also never call setQueryData", async () => {
    jest.mocked(codeBlueApi.start).mockResolvedValue({ id: "s-1", startedAt: "2026-08-10T12:00:00.000Z" });
    jest.mocked(codeBlueApi.addLogEntry).mockResolvedValue({ id: "log-1", duplicate: false });
    jest.mocked(codeBlueApi.presence).mockResolvedValue({ ok: true });
    const { view, setQueryDataSpy, invalidateSpy } = await setup();

    await act(async () => {
      view.result.current.start.mutate({ managerUserId: "u1", managerUserName: "Dr. Cohen" });
    });
    await waitFor(() => expect(view.result.current.start.isSuccess).toBe(true));

    await act(async () => {
      view.result.current.addLogEntry.mutate({
        sessionId: "s-1",
        payload: { idempotencyKey: "k1", elapsedMs: 1000, label: "Defibrillator", category: "equipment" },
      });
    });
    await waitFor(() => expect(view.result.current.addLogEntry.isSuccess).toBe(true));

    await act(async () => {
      view.result.current.presence.mutate("s-1");
    });
    await waitFor(() => expect(view.result.current.presence.isSuccess).toBe(true));

    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: codeBlueKeys.active() });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });
});

describe("useCodeBlueMutations — explicit retry:0 doctrine anchor", () => {
  /**
   * The production `QueryClient` (`src/lib/query-client.ts`) does not set
   * `defaultOptions.mutations.retry` today, so react-query's own v5 default
   * (0) already gives "never retried". This anchors that guarantee at the
   * MUTATION level so it survives even if a future app-wide default ever
   * adds mutation retries: a hostile queryClient default (`retry: 3`) is
   * used here, and per-mutation `retry: 0` must still win.
   */
  async function setupHostile() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: 3, retryDelay: 1 },
      },
    });
    const view = await renderHook(() => useCodeBlueMutations(), { wrapper: makeWrapper(queryClient) });
    return { queryClient, view };
  }

  it("start: a single network failure is never retried even under a hostile queryClient default", async () => {
    jest.mocked(codeBlueApi.start).mockRejectedValue(new Error("boom"));
    const { view } = await setupHostile();

    await act(async () => {
      view.result.current.start.mutate({ managerUserId: "u1", managerUserName: "Dr. Cohen" });
    });
    await waitFor(() => expect(view.result.current.start.isError).toBe(true));
    // Give a would-be retry's delay a chance to fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(codeBlueApi.start).toHaveBeenCalledTimes(1);
  });
});

describe("useCodeBlueMutations — happy path wiring", () => {
  it("start calls codeBlueApi.start with the given payload", async () => {
    jest.mocked(codeBlueApi.start).mockResolvedValue({ id: "s-1", startedAt: "2026-08-10T12:00:00.000Z" });
    const { view } = await setup();

    await act(async () => {
      view.result.current.start.mutate({ managerUserId: "u1", managerUserName: "Dr. Cohen" });
    });
    await waitFor(() => expect(view.result.current.start.isSuccess).toBe(true));

    expect(codeBlueApi.start).toHaveBeenCalledWith({ managerUserId: "u1", managerUserName: "Dr. Cohen" });
  });

  it("addLogEntry calls codeBlueApi.addLogEntry with sessionId + payload", async () => {
    jest.mocked(codeBlueApi.addLogEntry).mockResolvedValue({ id: "log-1", duplicate: false });
    const { view } = await setup();

    const payload = { idempotencyKey: "k1", elapsedMs: 2000, label: "note", category: "note" as const };
    await act(async () => {
      view.result.current.addLogEntry.mutate({ sessionId: "s-1", payload });
    });
    await waitFor(() => expect(view.result.current.addLogEntry.isSuccess).toBe(true));

    expect(codeBlueApi.addLogEntry).toHaveBeenCalledWith("s-1", payload);
  });

  it("end calls codeBlueApi.end with sessionId + payload", async () => {
    jest.mocked(codeBlueApi.end).mockResolvedValue({ id: "s-1", endedAt: "x", summary: {} });
    const { view } = await setup();

    await act(async () => {
      view.result.current.end.mutate({ sessionId: "s-1", payload: { outcome: "died", earlyStopReason: undefined } });
    });
    await waitFor(() => expect(view.result.current.end.isSuccess).toBe(true));

    expect(codeBlueApi.end).toHaveBeenCalledWith("s-1", { outcome: "died", earlyStopReason: undefined });
  });

  it("presence calls codeBlueApi.presence with sessionId", async () => {
    jest.mocked(codeBlueApi.presence).mockResolvedValue({ ok: true });
    const { view } = await setup();

    await act(async () => {
      view.result.current.presence.mutate("s-1");
    });
    await waitFor(() => expect(view.result.current.presence.isSuccess).toBe(true));

    expect(codeBlueApi.presence).toHaveBeenCalledWith("s-1");
  });
});
