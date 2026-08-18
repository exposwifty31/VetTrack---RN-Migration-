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
import * as Crypto from "expo-crypto";

import { CodeBlueActions } from "../CodeBlueActions";
import { useCodeBlueMutations } from "../useCodeBlueMutations";
import { useIdentity } from "@/app/useIdentity";
import { ApiCodedError } from "@/lib/api/coded-error";
import { EmergencyOfflineError } from "@/lib/emergency-block";
import type { ActiveCodeBlueResponse, CodeBlueManager } from "@/types/code-blue";
import type { MeUser } from "@/types/api";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// Default "idem-key-1" for every existing call site; individual tests may
// override with `.mockReturnValueOnce(...)` to prove stable-key behavior
// (CodeRabbit PR #49) without disturbing the shared default.
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "idem-key-1") }));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"),
  useQuery: jest.fn(),
}));

jest.mock("@/app/useIdentity", () => ({ useIdentity: jest.fn() }));

jest.mock("../useCodeBlueMutations", () => ({ useCodeBlueMutations: jest.fn() }));

/**
 * The action bar now issues TWO queries: the shared active-session read and
 * (initiator-but-not-self-manager only) the manager-candidate list. A single
 * `mockReturnValue` would hand the session result to both, so the mock
 * dispatches on the queryKey root instead.
 */
type ManagersQueryStub = {
  data?: readonly CodeBlueManager[];
  isPending?: boolean;
  isError?: boolean;
};

let managersResult: ManagersQueryStub = { data: [], isPending: false, isError: false };

function installQueryMock(session: Partial<UseQueryResult<ActiveCodeBlueResponse, Error>>) {
  jest.mocked(useQuery).mockImplementation((options: unknown) => {
    const key = (options as { queryKey?: readonly unknown[] }).queryKey ?? [];
    const base = { data: undefined, isPending: false, isError: false, refetch: jest.fn() };
    if (key[0] === "users") {
      return { ...base, ...managersResult } as never;
    }
    return {
      ...base,
      dataUpdatedAt: Date.parse("2026-08-10T12:00:00.000Z"),
      ...session,
    } as never;
  });
}

function mockSessionQuery(overrides: Partial<UseQueryResult<ActiveCodeBlueResponse, Error>>) {
  installQueryMock(overrides);
}

function mockManagersQuery(overrides: ManagersQueryStub) {
  managersResult = { data: [], isPending: false, isError: false, ...overrides };
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

beforeEach(() => {
  managersResult = { data: [], isPending: false, isError: false };
});

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

  it("CodeRabbit PR #49 (Minor): renders nothing when the identity read FAILED — role-gated affordances would be misleading", async () => {
    jest.mocked(useIdentity).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useIdentity>);
    mockSessionQuery({ data: { session: null } as unknown as ActiveCodeBlueResponse });
    await render(<CodeBlueActions />);
    expect(screen.queryByTestId("code-blue-actions")).toBeNull();
    expect(screen.queryByText("codeBlue.actions.startNotEligible")).toBeNull();
  });

  it("CodeRabbit PR #49 (Minor): renders nothing when identity SETTLED without data (no error) — the other half of the guard", async () => {
    jest.mocked(useIdentity).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useIdentity>);
    mockSessionQuery({ data: { session: null } as unknown as ActiveCodeBlueResponse });
    await render(<CodeBlueActions />);
    expect(screen.queryByTestId("code-blue-actions")).toBeNull();
    expect(screen.queryByText("codeBlue.actions.startNotEligible")).toBeNull();
  });

  it("CodeRabbit PR #49 (Major): never offers Start when the active-session query itself FAILED — a failed read is 'unknown', not 'no session', and must not risk a double-start", async () => {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    const refetch = jest.fn();
    mockSessionQuery({ isError: true, data: undefined, refetch });

    await render(<CodeBlueActions />);
    expect(screen.queryByText("codeBlue.actions.start")).toBeNull();
    expect(screen.queryByText("codeBlue.actions.startNotEligible")).toBeNull();
    expect(screen.getByText("codeBlue.loadError")).toBeTruthy();

    fireEvent.press(screen.getByText("common.retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  describe("no active session", () => {
    it("a vet sees a Start button that self-designates as manager", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen", displayName: null });
      mockSessionQuery({ data: NO_ACTIVE });
      const startMutate = jest.fn();
      mockMutations({ start: { mutate: startMutate } });

      await render(<CodeBlueActions />);
      fireEvent.press(screen.getByText("codeBlue.actions.start"));

      expect(startMutate).toHaveBeenCalledWith(
        {
          idempotencyToken: "idem-key-1",
          managerUserId: "user-1",
          managerUserName: "Dr. Cohen",
        },
        expect.anything(),
      );
    });

    it("a vet with no resolvable name never fires Start with an empty managerUserName (server rejects it)", async () => {
      mockIdentity({ id: "user-1", role: "vet", name: null, displayName: null });
      mockSessionQuery({ data: NO_ACTIVE });
      const startMutate = jest.fn();
      mockMutations({ start: { mutate: startMutate } });

      await render(<CodeBlueActions />);
      fireEvent.press(screen.getByText("codeBlue.actions.start"));

      expect(startMutate).not.toHaveBeenCalled();
    });

    it("a senior_technician — a valid INITIATOR but not a valid MANAGER — gets the picker, and starts by nominating", async () => {
      mockIdentity({ id: "user-2", role: "senior_technician", name: "Tech Levi" });
      mockManagersQuery({
        data: [
          { id: "u-vet", name: "Dr. Cohen", role: "vet" },
          { id: "u-admin", name: "Ops Admin", role: "admin" },
        ],
      });
      mockSessionQuery({ data: NO_ACTIVE });
      const startMutate = jest.fn();
      mockMutations({ start: { mutate: startMutate } });

      await render(<CodeBlueActions />);
      expect(screen.queryByText("codeBlue.actions.startNotEligible")).toBeNull();
      expect(screen.getByText("codeBlue.actions.pickManager")).toBeTruthy();

      fireEvent.press(screen.getByText("Dr. Cohen"));

      // NEVER self-designates — that is a guaranteed 400 INVALID_MANAGER.
      expect(startMutate).toHaveBeenCalledWith(
        {
          idempotencyToken: "idem-key-1",
          managerUserId: "u-vet",
          managerUserName: "Dr. Cohen",
        },
        expect.anything(),
      );
    });

    it("keeps the picker on screen after a 403 MANAGER_NOT_CODE_BLUE_ELIGIBLE so a different manager can be nominated", async () => {
      mockIdentity({ id: "user-2", role: "technician", name: "Tech Levi" });
      mockManagersQuery({
        data: [
          { id: "u-vet", name: "Dr. Cohen", role: "vet" },
          { id: "u-admin", name: "Ops Admin", role: "admin" },
        ],
      });
      mockSessionQuery({ data: NO_ACTIVE });
      mockMutations({
        start: {
          isError: true,
          error: new ApiCodedError(403, "MANAGER_NOT_CODE_BLUE_ELIGIBLE"),
        },
      });

      await render(<CodeBlueActions />);
      expect(screen.getByText("codeBlue.errors.managerNotEligible")).toBeTruthy();
      expect(screen.getByText("Dr. Cohen")).toBeTruthy();
      expect(screen.getByText("Ops Admin")).toBeTruthy();
    });

    it("tells an initiator when NO eligible manager exists rather than offering an unusable Start", async () => {
      mockIdentity({ id: "user-2", role: "technician", name: "Tech Levi" });
      mockManagersQuery({ data: [] });
      mockSessionQuery({ data: NO_ACTIVE });

      await render(<CodeBlueActions />);
      expect(screen.getByText("codeBlue.actions.managersEmpty")).toBeTruthy();
      expect(screen.queryByText("codeBlue.actions.start")).toBeNull();
    });

    it("a role outside the server's initiator allow-list (student) sees the explanation, never a picker", async () => {
      mockIdentity({ id: "user-3", role: "student", name: "Student Bar" });
      mockSessionQuery({ data: NO_ACTIVE });

      await render(<CodeBlueActions />);
      expect(screen.queryByText("codeBlue.actions.start")).toBeNull();
      expect(screen.queryByText("codeBlue.actions.pickManager")).toBeNull();
      expect(screen.getByText("codeBlue.actions.startNotEligible")).toBeTruthy();
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
        // CodeRabbit PR #49: the draft only clears on the mutation's own
        // onSuccess, passed as the per-call options object.
        expect.objectContaining({ onSuccess: expect.any(Function) }),
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

    it("CodeRabbit PR #49 (DOCTRINE breach): shows the LOUD offline banner for a failed presence attempt — was previously silently ignored", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" });
      mockSessionQuery({ data: ACTIVE });
      const offlineErr = new EmergencyOfflineError(
        "presence",
        "/api/code-blue/sessions/cb-1/presence",
        "PATCH",
      );
      mockMutations({ presence: { isError: true, error: offlineErr } });

      await render(<CodeBlueActions />);
      expect(screen.getByTestId("code-blue-offline-banner")).toBeTruthy();
      expect(screen.getByText("codeBlue.errors.offline")).toBeTruthy();
    });

    it("presence: a generic coded error shows the generic banner (not the offline one)", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" });
      mockSessionQuery({ data: ACTIVE });
      mockMutations({
        presence: { isError: true, error: new ApiCodedError(404, "SESSION_NOT_FOUND") },
      });

      await render(<CodeBlueActions />);
      expect(screen.getByTestId("code-blue-error-banner")).toBeTruthy();
      expect(screen.queryByTestId("code-blue-offline-banner")).toBeNull();
      expect(screen.getByText("codeBlue.errors.notFound")).toBeTruthy();
    });

    it("CodeRabbit PR #49 (Major): keeps the draft note on a failed log attempt and reuses the SAME idempotency key on a retry with unchanged text", async () => {
      mockIdentity({ id: "user-9", role: "technician", name: "Tech" });
      mockSessionQuery({ data: ACTIVE });
      const addLogMutate = jest.fn();
      mockMutations({ addLogEntry: { mutate: addLogMutate } });
      jest.mocked(Crypto.randomUUID).mockReturnValueOnce("uuid-a").mockReturnValueOnce("uuid-b");

      await render(<CodeBlueActions />);
      await act(async () => {
        fireEvent.changeText(screen.getByTestId("code-blue-log-input"), "Amiodarone 300mg");
      });
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.addLog"));
      });

      // `mutate` is a bare jest.fn() here — it never resolves, simulating an
      // in-flight/failed attempt. The draft must still be visible; nothing
      // clears it until the mutation's own onSuccess actually fires.
      expect(screen.getByTestId("code-blue-log-input").props.value).toBe("Amiodarone 300mg");

      // Retry with the SAME text — must reuse the same idempotency key, not
      // mint a new one (a naive retry-with-a-fresh-key could double-post).
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.addLog"));
      });

      expect(addLogMutate).toHaveBeenCalledTimes(2);
      const calls = addLogMutate.mock.calls as [{ payload: { idempotencyKey: string } }][];
      expect(calls[0][0].payload.idempotencyKey).toBe("uuid-a");
      expect(calls[1][0].payload.idempotencyKey).toBe("uuid-a"); // SAME key — no new mint
      expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);

      // Now change the draft text — a genuinely NEW entry must mint a fresh key.
      await act(async () => {
        fireEvent.changeText(screen.getByTestId("code-blue-log-input"), "Different note");
      });
      await act(async () => {
        fireEvent.press(screen.getByText("codeBlue.actions.addLog"));
      });

      expect(addLogMutate).toHaveBeenCalledTimes(3);
      expect(calls[2][0].payload.idempotencyKey).toBe("uuid-b");
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

/**
 * Requirement 3 + 4 — the action bar must gate on the SHIFT-derived role
 * (`effectiveRole`, falling back to `role`) for gate 1, while gate 2 stays on
 * the PERMANENT role, because the server checks `inArray(users.role, …)` there.
 * Reading one field for both is wrong in both directions, and each direction
 * has a bedside cost.
 */
describe("CodeBlueActions — effectiveRole vs permanent role (the two gates read different fields)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutations({});
  });

  it("an ADMIN rostered onto a technician shift can start — gate 1 passes on the shift role, gate 2 on permanent admin, so it is a one-tap self-designation", async () => {
    mockIdentity({
      id: "user-9",
      role: "admin",
      effectiveRole: "technician",
      name: "Ops Admin",
      displayName: null,
    });
    mockSessionQuery({ data: NO_ACTIVE });
    const startMutate = jest.fn();
    mockMutations({ start: { mutate: startMutate } });

    await render(<CodeBlueActions />);
    expect(screen.queryByText("codeBlue.actions.startNotEligible")).toBeNull();

    fireEvent.press(screen.getByText("codeBlue.actions.start"));
    expect(startMutate).toHaveBeenCalledWith(
      {
        idempotencyToken: "idem-key-1",
        managerUserId: "user-9",
        managerUserName: "Ops Admin",
      },
      expect.anything(),
    );
  });

  it("a VET rostered onto an ADMIN shift gets NO start affordance — the server denies gate 1, so the one-tap must be gated on BOTH gates, not on gate 2 alone", async () => {
    mockIdentity({
      id: "user-8",
      role: "vet",
      effectiveRole: "admin",
      name: "Dr. Cohen",
      displayName: null,
    });
    mockSessionQuery({ data: NO_ACTIVE });

    await render(<CodeBlueActions />);
    expect(screen.queryByText("codeBlue.actions.start")).toBeNull();
    expect(screen.queryByText("codeBlue.actions.pickManager")).toBeNull();
    expect(screen.getByText("codeBlue.actions.startNotEligible")).toBeTruthy();
  });
});

/**
 * Requirement 4 — nomination is SILENT by owner decision, and the nominated
 * manager is the ONLY identity the server will let end the session
 * (server/routes/code-blue.ts:993 `MANAGER_ONLY`). The person choosing is
 * usually NOT that identity, so the consequence has to be on screen at the
 * moment of choosing; there is no notify step that would carry it later.
 */
describe("CodeBlueActions — the picker states the end-of-session consequence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutations({});
  });

  it("tells the initiator that whoever they pick is the only person who can end the session", async () => {
    mockIdentity({ id: "user-2", role: "technician", name: "Tech Levi" });
    mockManagersQuery({ data: [{ id: "u-vet", name: "Dr. Cohen", role: "vet" }] });
    mockSessionQuery({ data: NO_ACTIVE });

    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.actions.pickManagerConsequence")).toBeTruthy();
  });

  /**
   * `ACTIVE.managerUserId` is "user-1", so identity MUST be user-1 for the End
   * controls to mount at all — a non-manager never renders them, which would
   * make this assertion pass vacuously.
   */
  it("names WHO must close the session on a 403 MANAGER_ONLY, rather than a generic refusal", async () => {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    mockSessionQuery({ data: ACTIVE });
    mockMutations({ end: { isError: true, error: new ApiCodedError(403, "MANAGER_ONLY") } });

    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.managerOnly")).toBeTruthy();
  });

  it("routes NO_VET_MANAGER to the escalation copy — 'retry' would loop the user mid-arrest", async () => {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    mockSessionQuery({ data: ACTIVE });
    mockMutations({ end: { isError: true, error: new ApiCodedError(422, "NO_VET_MANAGER") } });

    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.managerNoLongerEligible")).toBeTruthy();
  });
});

/**
 * Requirement 5, proven at the surface it is about: the mapped key has to
 * reach a rendered banner, not just be returned by the mapper.
 *
 * `notClinical` is reachable from TWO mutations, not one:
 * `requireClinicalAuthority` guards both POST /sessions and
 * POST /sessions/:id/logs (server/routes/code-blue.ts:288, 797), while end and
 * presence are `requireAuth`-only (:897, :966) and cannot emit it. That is why
 * its copy names the actor's missing authority rather than "starting" — on the
 * log path a start-specific message would be the wrong action.
 */
describe("CodeBlueActions — start-path coded errors reach the banner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutations({});
  });

  // REMOVED IN RECONCILE: a test asserting CODE_BLUE_START_CONFLICT with reason
  // "OWNER_IN_FLIGHT" -> a dedicated `startConflict` key. The server emits
  // exactly three reasons for that code (server/lib/code-blue-one-tap.ts:247,
  // 275, 295 -> uppercased at routes/code-blue.ts:643): ACTIVE_LEASE,
  // FENCE_SUPERSEDED, ACTIVE_SESSION_EXISTS. "OWNER_IN_FLIGHT" exists nowhere
  // in the server — it was an invented example, so the test pinned copy for a
  // response that cannot arrive. The one-tap mapper now splits the three real
  // reasons, each covered above/below.

  it("renders the clinical-authority copy when gate 1 denies with code INSUFFICIENT_ROLE + reason INSUFFICIENT_CLINICAL_AUTHORITY", async () => {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    mockSessionQuery({ data: NO_ACTIVE });
    mockMutations({
      start: {
        isError: true,
        error: new ApiCodedError(403, "INSUFFICIENT_ROLE", "INSUFFICIENT_CLINICAL_AUTHORITY"),
      },
    });

    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.notClinical")).toBeTruthy();
  });

  it("surfaces the SAME clinical-authority key from the log-entry path, which is gated by the same middleware", async () => {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    mockSessionQuery({ data: ACTIVE });
    mockMutations({
      addLogEntry: {
        isError: true,
        error: new ApiCodedError(403, "INSUFFICIENT_ROLE", "INSUFFICIENT_CLINICAL_AUTHORITY"),
      },
    });

    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.notClinical")).toBeTruthy();
  });
});

/**
 * J1 — the one-tap idempotency fence, at the only layer that can actually
 * prove it: the press gesture.
 *
 * The server keys `vt_code_blue_start_claims` on `idempotencyToken`. If the UI
 * minted a fresh token per PRESS, a double-press (or a retry after a lost
 * response) would open two independent claims and race two starts — exactly
 * the defect one-tap exists to remove. So "the second press re-sends the FIRST
 * token" is the guarantee, and it is a property of this component's ref, not
 * of the api module.
 *
 * TEST HYGIENE: tokens come from a sequenced `mockImplementation`, never
 * `mockReturnValueOnce`. A once-queue that a test does not fully drain leaks
 * into the next test (`jest.clearAllMocks()` does not empty it), which made an
 * earlier draft of this suite fail in file order while passing in isolation.
 */
describe("CodeBlueActions — one-tap idempotency fence", () => {
  /** Hands out tok-1, tok-2, … per call. Order-independent, nothing to leak. */
  function sequenceTokens() {
    let n = 0;
    jest.mocked(Crypto.randomUUID).mockImplementation(() => `tok-${++n}` as `${string}-${string}`);
  }

  function renderStartable(startOverrides: Partial<FakeMutation>) {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen", displayName: null });
    mockSessionQuery({ data: NO_ACTIVE });
    mockMutations({ start: startOverrides });
  }

  /** A mutate mock that honours the per-call `onSuccess`, like react-query does. */
  function mutateResolving(succeed: boolean) {
    return jest.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => {
      if (succeed) opts?.onSuccess?.();
    });
  }

  /**
   * Presses Start inside `act`, matching the double-press retry test above.
   * Verified empirically: with a BARE `fireEvent.press` here, this test still
   * passed but the NEXT test's `render` produced a null tree despite correct
   * mocks, and every test after it failed. Wrapping in `act` fixes it. The
   * precise unflushed work was not identified — only that `act` is required,
   * which is why the existing suite already uses this idiom.
   */
  const pressStart = async () => {
    await act(async () => {
      fireEvent.press(screen.getByText("codeBlue.actions.start"));
    });
  };

  const tokenOf = (mock: jest.Mock, call: number) =>
    (mock.mock.calls[call][0] as { idempotencyToken: string }).idempotencyToken;

  beforeEach(() => {
    jest.clearAllMocks();
    sequenceTokens();
    mockMutations({});
  });

  it("a second press RE-SENDS the same idempotencyToken — one token per gesture, not per press", async () => {
    const startMutate = mutateResolving(false);
    renderStartable({ mutate: startMutate });

    await render(<CodeBlueActions />);
    await pressStart();
    await pressStart();

    expect(startMutate).toHaveBeenCalledTimes(2);
    expect(tokenOf(startMutate, 0)).toBe("tok-1");
    expect(tokenOf(startMutate, 1)).toBe("tok-1"); // THE FENCE
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1); // minted once, not per press
  });

  it("sends the one-tap payload shape (token + self-designated manager)", async () => {
    const startMutate = mutateResolving(false);
    renderStartable({ mutate: startMutate });

    await render(<CodeBlueActions />);
    await pressStart();

    expect(startMutate.mock.calls[0][0]).toEqual({
      idempotencyToken: "tok-1",
      managerUserId: "user-1",
      managerUserName: "Dr. Cohen",
    });
  });

  it("after a SUCCESSFUL start the token resets — a later start must not replay the committed claim", async () => {
    const startMutate = mutateResolving(true);
    renderStartable({ mutate: startMutate });

    await render(<CodeBlueActions />);
    await pressStart(); // succeeds -> claim committed
    await pressStart(); // a genuinely NEW start

    expect(tokenOf(startMutate, 0)).toBe("tok-1");
    // Reusing tok-1 here would replay the committed claim and hand back the OLD
    // sessionId under outcome:"replay" instead of starting a new session.
    expect(tokenOf(startMutate, 1)).toBe("tok-2");
  });
});

/**
 * J1 — the three 409 `CODE_BLUE_START_CONFLICT` reasons must reach the operator
 * as three DIFFERENT instructions. This is the user-visible half of the
 * upgrade: the legacy route could only ever say "an active Code Blue exists",
 * whether your own start had in fact committed or someone else had won.
 */
describe("CodeBlueActions — one-tap conflict reasons render distinctly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutations({});
  });

  function renderWithStartError(error: unknown) {
    mockIdentity({ id: "user-1", role: "vet", name: "Dr. Cohen" });
    mockSessionQuery({ data: NO_ACTIVE });
    mockMutations({ start: { isError: true, error } });
  }

  it("ACTIVE_LEASE -> 'still starting, press again' copy", async () => {
    renderWithStartError(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "ACTIVE_LEASE"));
    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.startPending")).toBeTruthy();
  });

  it("FENCE_SUPERSEDED -> 'a newer attempt took over' copy", async () => {
    renderWithStartError(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "FENCE_SUPERSEDED"));
    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.startSuperseded")).toBeTruthy();
  });

  it("ACTIVE_SESSION_EXISTS -> the existing conflict copy", async () => {
    renderWithStartError(new ApiCodedError(409, "CODE_BLUE_START_CONFLICT", "ACTIVE_SESSION_EXISTS"));
    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.conflict")).toBeTruthy();
  });

  it("400 INVALID_MANAGER -> its own copy, not the generic banner", async () => {
    renderWithStartError(new ApiCodedError(400, "INVALID_MANAGER", "INVALID_MANAGER"));
    await render(<CodeBlueActions />);
    expect(screen.getByText("codeBlue.errors.invalidManager")).toBeTruthy();
  });

  it("offline STILL wins outright — the loud offline banner, never a conflict banner", async () => {
    renderWithStartError(new EmergencyOfflineError("start", "/api/code-blue/one-tap", "POST"));
    await render(<CodeBlueActions />);
    expect(screen.getByTestId("code-blue-offline-banner")).toBeTruthy();
    expect(screen.queryByTestId("code-blue-error-banner")).toBeNull();
  });
});
