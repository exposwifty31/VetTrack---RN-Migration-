/**
 * G4-5 — the mutation action bar. Two doctrine-critical assertions live here:
 *   - offline errors render the LOUD, DISTINCT offline banner (not the
 *     generic error banner) — `codeBlueMutationErrorKey` classification
 *     actually reaches the UI.
 *   - the "ended" view is driven ONLY by the active-session query data, never
 *     by `end` mutation state — even when the end mutation reports success,
 *     a still-stale query cache (the gap before invalidate's refetch lands)
 *     must keep rendering the ACTIVE session UI. This is the concrete proof
 *     that session end is server-confirmed, not optimistic.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { CodeBlueActions } from "../CodeBlueActions";
import { useCodeBlueMutations } from "../useCodeBlueMutations";
import { useIdentity } from "@/app/useIdentity";
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";
import type { ActiveCodeBlueResponse } from "@/types/code-blue";
import type { MeUser } from "@/types/api";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => "idem-key-1" }));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: jest.fn(),
}));

jest.mock("@/app/useIdentity", () => ({ useIdentity: jest.fn() }));

jest.mock("../useCodeBlueMutations", () => ({ useCodeBlueMutations: jest.fn() }));

function mockSessionQuery(overrides: Partial<UseQueryResult<ActiveCodeBlueResponse, Error>>) {
  jest.mocked(useQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    dataUpdatedAt: Date.parse("2026-08-10T12:00:00.000Z"),
    refetch: jest.fn(),
    ...overrides,
  } as unknown as UseQueryResult<ActiveCodeBlueResponse, Error>);
}

function mockIdentity(overrides: Partial<MeUser> | null, pending = false) {
  jest.mocked(useIdentity).mockReturnValue({
    data: overrides ? { id: "user-1", email: "a@b.com", ...overrides } : undefined,
    isPending: pending,
  } as unknown as ReturnType<typeof useIdentity>);
}

type FakeMutation = {
  mutate: jest.Mock;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
};

function fakeMutation(overrides: Partial<FakeMutation> = {}): FakeMutation {
  return {
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    ...overrides,
  };
}

function mockMutations(overrides: {
  start?: Partial<FakeMutation>;
  addLogEntry?: Partial<FakeMutation>;
  end?: Partial<FakeMutation>;
  presence?: Partial<FakeMutation>;
}) {
  jest.mocked(useCodeBlueMutations).mockReturnValue({
    start: fakeMutation(overrides.start),
    addLogEntry: fakeMutation(overrides.addLogEntry),
    end: fakeMutation(overrides.end),
    presence: fakeMutation(overrides.presence),
  } as unknown as ReturnType<typeof useCodeBlueMutations>);
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
  logEntries: [],
  presence: [],
  cartStatus: null,
  linkedEquipment: [],
};

describe("CodeBlueActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutations({});
  });

  it("renders nothing while identity or the session query is pending", async () => {
    mockIdentity(null, true);
    mockSessionQuery({ isPending: true });
    await render(<CodeBlueActions />);
    expect(screen.queryByTestId("code-blue-actions")).toBeNull();
  });

  describe("no active session", () => {
    it("a vet sees a Start button that self-designates as manager", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen", displayName: null });
      mockSessionQuery({ data: NO_ACTIVE });
      const startMutate = jest.fn();
      mockMutations({ start: { mutate: startMutate } });

      await render(<CodeBlueActions />);
      fireEvent.press(screen.getByText("codeBlue.actions.start"));

      expect(startMutate).toHaveBeenCalledWith({
        managerUserId: "user-1",
        managerUserName: "Dr. Cohen",
      });
    });

    it("a non-vet clinical role sees an explanation instead of a Start button", async () => {
      mockIdentity({ id: "user-2", role: "senior_technician", name: "Tech Levi" });
      mockSessionQuery({ data: NO_ACTIVE });

      await render(<CodeBlueActions />);
      expect(screen.queryByText("codeBlue.actions.start")).toBeNull();
      expect(screen.getByText("codeBlue.actions.startRequiresVet")).toBeTruthy();
    });

    it("shows the LOUD offline banner (not the generic one) when start fails offline", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
      mockSessionQuery({ data: NO_ACTIVE });
      const offlineErr = new EmergencyOfflineError("start", "/api/code-blue/sessions", "POST");
      mockMutations({ start: { isError: true, error: offlineErr } });

      await render(<CodeBlueActions />);
      expect(screen.getByTestId("code-blue-offline-banner")).toBeTruthy();
      expect(screen.queryByTestId("code-blue-error-banner")).toBeNull();
      expect(screen.getByText("codeBlue.errors.offline")).toBeTruthy();
    });

    it("shows the generic error banner (not the offline one) for a coded server error", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
      mockSessionQuery({ data: NO_ACTIVE });
      mockMutations({
        start: { isError: true, error: new ApiCodedError(409, "ACTIVE_SESSION_EXISTS") },
      });

      await render(<CodeBlueActions />);
      expect(screen.getByTestId("code-blue-error-banner")).toBeTruthy();
      expect(screen.queryByTestId("code-blue-offline-banner")).toBeNull();
      expect(screen.getByText("codeBlue.errors.conflict")).toBeTruthy();
    });
  });

  describe("active session", () => {
    it("submits a log entry with a computed elapsed clock and a fresh idempotency key", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" }); // not the manager
      mockSessionQuery({ data: ACTIVE, dataUpdatedAt: Date.parse("2026-08-10T12:00:00.000Z") });
      const addLogMutate = jest.fn();
      mockMutations({ addLogEntry: { mutate: addLogMutate } });

      await render(<CodeBlueActions />);
      await act(async () => {
        fireEvent.changeText(screen.getByTestId("code-blue-log-input"), "Amiodarone 300mg");
      });
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.addLog"));
      });

      expect(addLogMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "cb-1",
          payload: expect.objectContaining({
            idempotencyKey: "idem-key-1",
            label: "Amiodarone 300mg",
            category: "note",
          }),
        }),
      );
    });

    it("a non-manager never sees the End affordance", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" });
      mockSessionQuery({ data: ACTIVE });

      await render(<CodeBlueActions />);
      expect(screen.queryByText("codeBlue.actions.end")).toBeNull();
    });

    it("the manager can open the outcome picker and confirm End", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" }); // matches session.managerUserId
      mockSessionQuery({ data: ACTIVE });
      const endMutate = jest.fn();
      mockMutations({ end: { mutate: endMutate } });

      await render(<CodeBlueActions />);
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.end"));
      });
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.outcome.rosc"));
      });
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.confirmEnd"));
      });

      expect(endMutate).toHaveBeenCalledWith({ sessionId: "cb-1", payload: { outcome: "rosc" } });
    });

    it("presence Join calls the presence mutation with the session id", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" });
      mockSessionQuery({ data: ACTIVE });
      const presenceMutate = jest.fn();
      mockMutations({ presence: { mutate: presenceMutate } });

      await render(<CodeBlueActions />);
      fireEvent.press(screen.getByText("codeBlue.actions.join"));

      expect(presenceMutate).toHaveBeenCalledWith("cb-1");
    });

    it("still renders the ACTIVE session UI when end.isSuccess is true but the query cache has not yet refetched (never derives 'ended' from mutation state)", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
      // Simulate: end mutation resolved, but the query cache is still the
      // PRE-invalidate snapshot (the real refetch hasn't landed yet).
      mockSessionQuery({ data: ACTIVE });
      mockMutations({ end: { isSuccess: true } });

      await render(<CodeBlueActions />);

      // The component must still show active-session affordances (log +
      // join), proving it derives state from the query, not `end.isSuccess`.
      expect(screen.getByTestId("code-blue-log-input")).toBeTruthy();
      expect(screen.getByText("codeBlue.actions.join")).toBeTruthy();
    });
  });
});
