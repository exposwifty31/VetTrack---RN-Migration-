/**
 * Wiring test for the G4-1 read-only viewer: proves the query -> derive ->
 * render path end to end for each state, that the SSE sync hook is actually
 * mounted (not dead code), and that the elapsed clock ticks locally instead
 * of freezing between fetches (CodeRabbit PR #47). Mutation affordances are
 * asserted ABSENT — this slice is read-only by doctrine.
 */
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { CodeBlueViewer } from "../CodeBlueViewer";
import { useCodeBlueRealtimeSync } from "@/hooks/useCodeBlueRealtimeSync";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import type { ActiveCodeBlueResponse } from "@/types/code-blue";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: jest.fn(),
}));

jest.mock("@/hooks/useCodeBlueRealtimeSync", () => ({
  useCodeBlueRealtimeSync: jest.fn(),
}));

// FlashList virtualizes via native layout measurement, which the RN test
// renderer never fires — so `data` never reaches `renderItem` unmocked (the
// `AutopilotQueueScreen.test.tsx` precedent). Render header/footer/empty +
// every item directly, matching that mock's shape.
type FlashListItem = { id?: string };
jest.mock("@shopify/flash-list", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
    }: {
      data: readonly FlashListItem[];
      renderItem: (info: { item: FlashListItem; index: number }) => ReturnType<typeof React.createElement>;
      ListHeaderComponent?: ReturnType<typeof React.createElement>;
      ListFooterComponent?: ReturnType<typeof React.createElement>;
      ListEmptyComponent?: ReturnType<typeof React.createElement>;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement(React.Fragment, { key: item.id ?? index }, renderItem({ item, index })),
            ),
        ListFooterComponent,
      ),
  };
});

function mockQuery(overrides: Partial<UseQueryResult<ActiveCodeBlueResponse, Error>>) {
  jest.mocked(useQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    dataUpdatedAt: Date.parse("2026-08-10T12:00:00.000Z"),
    refetch: jest.fn(),
    ...overrides,
  } as unknown as UseQueryResult<ActiveCodeBlueResponse, Error>);
}

const NO_ACTIVE: ActiveCodeBlueResponse = {
  session: null,
  logEntries: [],
  presence: [],
  cartStatus: null,
  linkedEquipment: [],
};

const ACTIVE: ActiveCodeBlueResponse = {
  session: {
    id: "cb-1",
    clinicId: "dev-clinic-default",
    startedAt: "2026-08-10T11:57:00.000Z",
    startedBy: "user-1",
    startedByName: "Dr. Cohen",
    managerUserId: "user-1",
    managerUserName: "Dr. Cohen",
    status: "active",
    outcome: null,
    preCheckPassed: null,
    endedAt: null,
    createdAt: "2026-08-10T11:57:00.000Z",
    isReconciled: false,
    reconciledAt: null,
    reconciledByUserId: null,
  },
  logEntries: [
    {
      id: "log-1",
      sessionId: "cb-1",
      clinicId: "dev-clinic-default",
      idempotencyKey: "k1",
      elapsedMs: 0,
      label: "Defibrillator",
      category: "equipment",
      equipmentId: "eq-1",
      loggedByUserId: "user-1",
      loggedByName: "Dr. Cohen",
      createdAt: "2026-08-10T11:57:00.000Z",
    },
  ],
  presence: [
    { sessionId: "cb-1", userId: "user-1", userName: "Dr. Cohen", lastSeenAt: "2026-08-10T11:59:50.000Z" },
  ],
  cartStatus: {
    lastCheckedAt: "2026-08-10T08:00:00.000Z",
    allPassed: true,
    performedByName: "Tech Levi",
  },
  linkedEquipment: [],
};

describe("CodeBlueViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mounts the SSE sync hook (freshness is subscribe-only, never a poll loop)", async () => {
    mockQuery({ data: NO_ACTIVE });
    await render(<CodeBlueViewer />);
    expect(useCodeBlueRealtimeSync).toHaveBeenCalledTimes(1);
  });

  it("queries the canonical active key with the read-only fetcher", async () => {
    mockQuery({ data: NO_ACTIVE });
    await render(<CodeBlueViewer />);
    expect(jest.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: codeBlueKeys.active(),
        queryFn: codeBlueApi.active,
      }),
    );
  });

  it("shows a loading state while the query is pending", async () => {
    mockQuery({ isPending: true });
    await render(<CodeBlueViewer />);
    expect(screen.getByText("common.loading")).toBeTruthy();
  });

  it("shows an honest error + retry, and retry calls refetch", async () => {
    const refetch = jest.fn();
    mockQuery({ isError: true, refetch });
    await render(<CodeBlueViewer />);
    expect(screen.getByText("codeBlue.loadError")).toBeTruthy();
    fireEvent.press(screen.getByText("common.retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the "no active session" state when session is null', async () => {
    mockQuery({ data: NO_ACTIVE });
    await render(<CodeBlueViewer />);
    expect(screen.getByText("codeBlue.noActiveSession")).toBeTruthy();
  });

  it("renders session details, log entries, and presence for an active session", async () => {
    mockQuery({ data: ACTIVE });
    await render(<CodeBlueViewer />);
    expect(screen.getAllByText("Dr. Cohen").length).toBeGreaterThan(0); // manager/startedBy/presence
    expect(screen.getByText("Defibrillator")).toBeTruthy(); // log entry
    expect(screen.getByText("codeBlue.cartAllPassed")).toBeTruthy();
  });

  it("never renders a mutation button (read-only doctrine)", async () => {
    mockQuery({ data: ACTIVE });
    await render(<CodeBlueViewer />);
    // No accessibilityRole "button" beyond the (absent, since query isn't
    // errored) retry affordance — the only interactive element on this
    // screen in the active/empty states is nothing at all.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  describe("elapsed clock", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("ticks locally from the session start time instead of freezing between fetches", async () => {
      mockQuery({ data: ACTIVE }); // startedAt 11:57:00 -> 03:00 immediately on mount
      await render(<CodeBlueViewer />);
      expect(screen.getByText("03:00")).toBeTruthy();

      // No new fetch lands (dataUpdatedAt never changes) — only wall-clock time
      // passes. A frozen clock (the bug CodeRabbit flagged) would still read
      // 03:00 here; the fix must show 03:05.
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.queryByText("03:00")).toBeNull();
      expect(screen.getByText("03:05")).toBeTruthy();
    });
  });
});
