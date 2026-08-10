/**
 * Wiring test for the G4-1 read-only viewer: proves the query -> derive ->
 * render path end to end for each state, and that the SSE sync hook is
 * actually mounted (not dead code). Mutation affordances are asserted ABSENT
 * — this slice is read-only by doctrine.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { CodeBlueViewer } from "../CodeBlueViewer";
import { useCodeBlueRealtimeSync } from "@/hooks/useCodeBlueRealtimeSync";
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
    expect(screen.getByText("03:00")).toBeTruthy(); // elapsed: dataUpdatedAt - startedAt
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
});
