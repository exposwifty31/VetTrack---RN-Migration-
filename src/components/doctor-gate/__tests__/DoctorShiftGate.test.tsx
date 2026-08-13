/**
 * DoctorShiftGate (Task 4) — the vet-only "are you on shift?" sheet.
 *
 * Contract under test (server truth = vettrack feat/doctor-shift-gate):
 *   - technician/admin identity → renders nothing, no active-check-in fetch;
 *   - vet with no active row + no snooze → ask step;
 *   - לא → snooze written (MMKV) + dismissed;
 *   - כן → team pick; a team tap POSTs {operationalRole, isSenior, source:"doctor_gate"}
 *     (the provenance stamp is REQUIRED on both check-in and the replace retry);
 *   - senior toggle renders only for seniorDoctorEligible; toggled → isSenior:true;
 *   - eligibilityPending (identity unsettled) → team commit blocked;
 *   - 409 SENIOR_ALREADY_ASSIGNED → replace-confirm (named body, or the generic
 *     fallback when details.currentSeniorName is null — the race path);
 *     החלף retries with replaceSenior:true; ביטול returns to pick;
 *   - other errors → checkInFailed note, sheet stays mounted.
 *
 * authFetch is mocked at the network seam so the REAL api module runs — the
 * source:"doctor_gate" stamp and body shapes are asserted on the wire.
 */
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DOCTOR_GATE_SNOOZE_KEY } from "../doctor-gate-derive";
import { DoctorShiftGate } from "../DoctorShiftGate";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-uuid" }));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

const mockGetItem = jest.fn<string | null, [string]>();
const mockSetItem = jest.fn();
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string) => mockGetItem(key),
  safeStorageSetItem: (key: string, value: string) => mockSetItem(key, value),
}));

const mockUseIdentity = jest.fn();
jest.mock("@/app/useIdentity", () => ({
  useIdentity: () => mockUseIdentity(),
}));

// Strip the reanimated/gesture/blur host so the sheet renders as plain views —
// but KEEP the onDismiss seam pressable so the drag-down-dismiss contract
// (dismiss WITHOUT snoozing) is exercisable (review finding: zero coverage).
jest.mock("@/components/ui/BottomSheet", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    BottomSheet: ({
      children,
      onDismiss,
    }: {
      children: React.ReactNode;
      onDismiss: () => void;
    }) => React.createElement(Pressable, { testID: "bottomsheet-host", onPress: onDismiss }, children),
  };
});
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("@/components/PressableScale", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "dark" }) }));
// Identity t that RECORDS its calls — the replace-flow tests assert the exact
// interpolation option names ({name}/{team}) reach i18next (review finding:
// renaming a call-site option key would otherwise ship a literal "{{name}}").
const mockTCalls: [string, Record<string, unknown> | undefined][] = [];
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      mockTCalls.push([key, opts]);
      return key;
    },
  }),
}));

type IdentityShape = Readonly<{
  data:
    | { effectiveRole: string; seniorDoctorEligible?: boolean }
    | undefined;
  isSuccess: boolean;
  isError: boolean;
}>;

function setIdentity(identity: IdentityShape) {
  mockUseIdentity.mockReturnValue(identity);
}

const VET: IdentityShape = {
  data: { effectiveRole: "vet", seniorDoctorEligible: false },
  isSuccess: true,
  isError: false,
};
const SENIOR_VET: IdentityShape = {
  data: { effectiveRole: "vet", seniorDoctorEligible: true },
  isSuccess: true,
  isError: false,
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

const ACTIVE_NONE = { active: null };
const OPENED_ROW = {
  id: "ci-1",
  clinicId: "c1",
  userId: "u1",
  operationalRole: "icu",
  isSenior: false,
  clinicalRoleAtCheckIn: "vet",
  checkedInAt: "2026-08-13T06:00:00.000Z",
  checkedOutAt: null,
  checkOutReason: null,
};

/** Route authFetch: GET me/active settles the gate query; POSTs are scripted per test. */
function routeAuthFetch(postResponses: readonly Response[]) {
  const posts = [...postResponses];
  mockAuthFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/clinical-check-in/me/active" && (!init || !init.method)) {
      return jsonResponse(200, ACTIVE_NONE);
    }
    const next = posts.shift();
    if (!next) throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
    return next;
  });
}

function postedBodies(): { path: string; body: Record<string, unknown> }[] {
  return mockAuthFetch.mock.calls
    .filter(([, init]: [string, RequestInit | undefined]) => init?.method === "POST")
    .map(([path, init]: [string, RequestInit]) => ({
      path,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    }));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

async function renderGate() {
  const { queryClient, Wrapper } = makeWrapper();
  const view = await render(<DoctorShiftGate />, { wrapper: Wrapper });
  return { queryClient, view };
}

async function waitForAsk() {
  await waitFor(() => expect(screen.getByText("doctorGate.areYouOnShift")).toBeTruthy());
}

/** Press + async act flush — the repo's AssigneePicker pattern (React 19 concurrent). */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockGetItem.mockReset().mockReturnValue(null);
  mockSetItem.mockReset();
  mockUseIdentity.mockReset();
  mockTCalls.length = 0;
});

describe("DoctorShiftGate — audience", () => {
  it("renders nothing and fetches nothing for a technician", async () => {
    setIdentity({
      data: { effectiveRole: "technician" },
      isSuccess: true,
      isError: false,
    });
    const { view } = await renderGate();
    expect(view.toJSON()).toBeNull();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("shows the ask step for a vet with no active check-in and no snooze", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();
  });

  it("stays hidden while a snooze is live", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    mockGetItem.mockReturnValue(String(Date.now() + 60_000));
    await renderGate();
    await waitFor(() =>
      expect(mockAuthFetch).toHaveBeenCalledWith("/api/clinical-check-in/me/active", undefined),
    );
    expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull();
  });

  it("stays hidden (fail-closed) when the active-check-in lookup errors", async () => {
    // Mirror of the vettrack client's fail-closed gating: an errored lookup
    // never shows the gate — a vet who may already be checked in must not be
    // re-prompted into an unwinnable 409 loop on flaky connectivity.
    setIdentity(VET);
    mockAuthFetch.mockImplementation(async (path: string) => {
      if (path === "/api/clinical-check-in/me/active") {
        return jsonResponse(500, { code: "INTERNAL" });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    const { queryClient } = await renderGate();
    await waitFor(() =>
      expect(queryClient.getQueryState(["clinical-check-in", "active"])?.status).toBe("error"),
    );
    expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull();
  });

  it("does not pop the gate after an observed active check-in transitions to null (end-shift path)", async () => {
    // Cross-component contract: ending the shift (or an admin force-close /
    // the 14h auto-expiry) invalidates the active query — the gate must treat
    // the session as answered, not present "are you on shift?" seconds after
    // the vet explicitly went off shift.
    setIdentity(VET);
    let active: unknown = OPENED_ROW;
    mockAuthFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/clinical-check-in/me/active" && (!init || !init.method)) {
        return jsonResponse(200, { active });
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
    });
    const { queryClient } = await renderGate();
    await waitFor(() =>
      expect(queryClient.getQueryState(["clinical-check-in", "active"])?.status).toBe("success"),
    );
    // The cache reaches success before the component's observer notification
    // fires (react-query batches notifications on a setTimeout(0) macrotask) —
    // flush a macrotask inside act so the gate has RENDERED the active row and
    // the session-latch effect ran before the row transitions to null.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull();

    active = null;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["clinical-check-in", "active"] });
    });
    expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull();
  });
});

describe("DoctorShiftGate — dismiss without snoozing", () => {
  it("BottomSheet drag-dismiss unmounts WITHOUT writing the snooze", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByTestId("bottomsheet-host"));

    expect(mockSetItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull());
  });

  it("Modal onRequestClose (Android back) dismisses WITHOUT writing the snooze", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    const { view } = await renderGate();
    await waitForAsk();

    await act(async () => {
      const [modal] = view.container.queryAll((node) => node.type === "Modal");
      expect(modal).toBeTruthy();
      modal.props.onRequestClose();
    });

    expect(mockSetItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull());
  });
});

describe("DoctorShiftGate — ask step", () => {
  it("לא writes the snooze and dismisses", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByText("doctorGate.no"));

    expect(mockSetItem).toHaveBeenCalledWith(DOCTOR_GATE_SNOOZE_KEY, expect.any(String));
    await waitFor(() => expect(screen.queryByText("doctorGate.areYouOnShift")).toBeNull());
  });

  it("כן advances to the team pick", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));

    expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy();
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe("DoctorShiftGate — team commit", () => {
  it("a team tap posts operationalRole + isSenior:false + source:doctor_gate", async () => {
    setIdentity(VET);
    routeAuthFetch([jsonResponse(200, OPENED_ROW)]);
    const { queryClient } = await renderGate();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByText("doctorGate.teamIcu"));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0]).toEqual({
      path: "/api/clinical-check-in/check-in",
      body: { operationalRole: "icu", isSenior: false, source: "doctor_gate" },
    });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clinical-check-in"] }),
    );
    await waitFor(() => expect(screen.queryByText("doctorGate.pickTeam")).toBeNull());
  });

  it("hides the senior toggle when seniorDoctorEligible is falsy", async () => {
    setIdentity(VET);
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();
    await press(screen.getByText("doctorGate.yes"));

    expect(screen.queryByText("doctorGate.iAmSenior")).toBeNull();
  });

  it("senior toggle + team posts isSenior:true", async () => {
    setIdentity(SENIOR_VET);
    routeAuthFetch([jsonResponse(200, { ...OPENED_ROW, isSenior: true })]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));
    const toggle = screen.getByLabelText("doctorGate.iAmSenior");
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await press(toggle);
    await press(screen.getByText("doctorGate.teamAdmission"));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0].body).toEqual({
      operationalRole: "admission",
      isSenior: true,
      source: "doctor_gate",
    });
  });

  it("blocks team commit while eligibility is pending (identity unsettled)", async () => {
    setIdentity({
      data: { effectiveRole: "vet" },
      isSuccess: false,
      isError: false,
    });
    routeAuthFetch([]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));
    const icu = screen.getByLabelText("doctorGate.teamIcu");
    expect(icu.props.accessibilityState.disabled).toBe(true);
    await press(icu);

    expect(postedBodies()).toHaveLength(0);
  });
});

describe("DoctorShiftGate — SENIOR_ALREADY_ASSIGNED replace flow", () => {
  const conflict409 = (currentSeniorName: string | null) =>
    jsonResponse(409, {
      code: "SENIOR_ALREADY_ASSIGNED",
      details: { currentSeniorName },
    });

  async function driveToConflict(name: string | null) {
    setIdentity(SENIOR_VET);
    routeAuthFetch([conflict409(name), jsonResponse(200, { ...OPENED_ROW, isSenior: true })]);
    await renderGate();
    await waitForAsk();
    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByLabelText("doctorGate.iAmSenior"));
    await press(screen.getByText("doctorGate.teamIcu"));
    await waitFor(() => expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy());
  }

  it("shows the named body and retries with replaceSenior:true on החלף", async () => {
    await driveToConflict("Dr. Shapiro");
    expect(screen.getByText("doctorGate.replaceSeniorBody")).toBeTruthy();
    // Interpolation wiring: the exact {name}/{team} option names must reach t.
    expect(mockTCalls).toContainEqual([
      "doctorGate.replaceSeniorBody",
      { name: "Dr. Shapiro", team: "doctorGate.teamIcu" },
    ]);

    await press(screen.getByText("doctorGate.replace"));

    await waitFor(() => expect(postedBodies()).toHaveLength(2));
    expect(postedBodies()[1]).toEqual({
      path: "/api/clinical-check-in/check-in",
      body: {
        operationalRole: "icu",
        isSenior: true,
        replaceSenior: true,
        source: "doctor_gate",
      },
    });
  });

  it("falls back to the generic body when currentSeniorName is null (race path)", async () => {
    await driveToConflict(null);
    expect(screen.getByText("doctorGate.replaceSeniorBodyGeneric")).toBeTruthy();
    expect(screen.queryByText("doctorGate.replaceSeniorBody")).toBeNull();
    expect(mockTCalls).toContainEqual([
      "doctorGate.replaceSeniorBodyGeneric",
      { team: "doctorGate.teamIcu" },
    ]);
  });

  it("ביטול returns to the team pick", async () => {
    await driveToConflict("Dr. Shapiro");

    await press(screen.getByText("doctorGate.cancel"));

    await waitFor(() => expect(screen.queryByText("doctorGate.replaceSeniorTitle")).toBeNull());
    expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy();
    expect(postedBodies()).toHaveLength(1);
  });

  it("keeps the replace-confirm view mounted while the replace retry is in flight", async () => {
    setIdentity(SENIOR_VET);
    let resolveRetry!: (r: Response) => void;
    const pendingRetry = new Promise<Response>((res) => {
      resolveRetry = res;
    });
    const posts: (Response | Promise<Response>)[] = [conflict409("Dr. Shapiro"), pendingRetry];
    mockAuthFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/clinical-check-in/me/active" && (!init || !init.method)) {
        return jsonResponse(200, ACTIVE_NONE);
      }
      const next = posts.shift();
      if (!next) throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      return next;
    });
    await renderGate();
    await waitForAsk();
    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByLabelText("doctorGate.iAmSenior"));
    await press(screen.getByText("doctorGate.teamIcu"));
    await waitFor(() => expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy());

    await press(screen.getByText("doctorGate.replace"));

    // Mid-retry: the confirm view must NOT collapse to the team pick.
    expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy();
    expect(screen.queryByText("doctorGate.pickTeam")).toBeNull();

    await act(async () => {
      resolveRetry(jsonResponse(200, { ...OPENED_ROW, isSenior: true }));
    });
    await waitFor(() => expect(screen.queryByText("doctorGate.replaceSeniorTitle")).toBeNull());
  });

  it("a non-409 replace failure keeps the replace view and shows checkInFailed", async () => {
    setIdentity(SENIOR_VET);
    routeAuthFetch([conflict409("Dr. Shapiro"), jsonResponse(500, { code: "INTERNAL" })]);
    await renderGate();
    await waitForAsk();
    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByLabelText("doctorGate.iAmSenior"));
    await press(screen.getByText("doctorGate.teamIcu"));
    await waitFor(() => expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy());

    await press(screen.getByText("doctorGate.replace"));

    await waitFor(() => expect(screen.getByText("doctorGate.checkInFailed")).toBeTruthy());
    expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy();
    expect(screen.queryByText("doctorGate.pickTeam")).toBeNull();
  });
});

describe("DoctorShiftGate — 409 ALREADY_CHECKED_IN", () => {
  it("treats ALREADY_CHECKED_IN as success-shaped: invalidates and dismisses", async () => {
    // Reachable when the vet checked in on the web app while the gate was
    // open — retrying can never succeed, so reconcile + dismiss instead of a
    // stuck retry-forever generic error.
    setIdentity(VET);
    routeAuthFetch([jsonResponse(409, { code: "ALREADY_CHECKED_IN" })]);
    const { queryClient } = await renderGate();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByText("doctorGate.teamIcu"));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clinical-check-in"] }),
    );
    await waitFor(() => expect(screen.queryByText("doctorGate.pickTeam")).toBeNull());
    expect(screen.queryByText("doctorGate.checkInFailed")).toBeNull();
  });
});

describe("DoctorShiftGate — generic failure", () => {
  it("shows checkInFailed and keeps the sheet mounted", async () => {
    setIdentity(VET);
    routeAuthFetch([jsonResponse(500, { code: "INTERNAL" })]);
    await renderGate();
    await waitForAsk();

    await press(screen.getByText("doctorGate.yes"));
    await press(screen.getByText("doctorGate.teamInternalMedicine"));

    await waitFor(() => expect(screen.getByText("doctorGate.checkInFailed")).toBeTruthy());
    expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy();
  });
});
