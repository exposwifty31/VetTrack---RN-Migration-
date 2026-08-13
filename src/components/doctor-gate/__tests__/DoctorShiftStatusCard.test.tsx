/**
 * DoctorShiftStatusCard (Task 5) — vet on-shift status card in Home's header.
 *
 * Contract under test (mirror of the vettrack DoctorShiftStatus client):
 *   - null for a technician (no fetch) and for a vet with no active check-in;
 *   - shows the team status line + the senior suffix only when isSenior;
 *   - end-shift REQUIRES the confirm dialog — confirm → POST /check-out +
 *     invalidate; cancel → no POST;
 *   - switch-role opens the pick sheet; a team tap POSTs /switch with
 *     {operationalRole, isSenior: <current row state by default>, source:"doctor_gate"}
 *     (atomicity is server-side — never close+open);
 *   - senior toggle renders only for seniorDoctorEligible, defaults to the
 *     active row's isSenior, and drives the posted isSenior;
 *   - 409 SENIOR_ALREADY_ASSIGNED on switch → replace-confirm (named body, or
 *     the generic fallback when currentSeniorName is null); החלף retries
 *     /switch with replaceSenior:true; ביטול returns to the pick;
 *   - other switch errors → checkInFailed note, sheet stays mounted.
 *
 * authFetch is mocked at the network seam so the REAL api module runs — the
 * source:"doctor_gate" stamp and body shapes are asserted on the wire.
 */
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DoctorShiftStatusCard } from "../DoctorShiftStatusCard";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-uuid" }));

const mockAuthFetch = jest.fn();
jest.mock("@/lib/auth-fetch", () => ({
  authFetch: (path: string, init?: RequestInit) => mockAuthFetch(path, init),
}));

// The card imports shared pieces from DoctorShiftGate, which reaches
// safe-storage (MMKV) via doctor-gate-derive — stub the storage seam.
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: jest.fn(() => null),
  safeStorageSetItem: jest.fn(),
}));

const mockUseIdentity = jest.fn();
jest.mock("@/app/useIdentity", () => ({
  useIdentity: () => mockUseIdentity(),
}));

// Strip the reanimated/gesture/blur host so the sheet renders as plain views.
jest.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("@/components/PressableScale", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "dark" }) }));
// Identity t that RECORDS its calls — asserts the exact interpolation option
// names reach i18next (see the DoctorShiftGate suite note).
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
  data: { effectiveRole: string; seniorDoctorEligible?: boolean } | undefined;
  isSuccess: boolean;
  isError: boolean;
}>;

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

const ACTIVE_ROW = {
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

/** Route authFetch: GET me/active settles the query; POSTs are scripted per test. */
function routeAuthFetch(active: unknown, postResponses: readonly Response[]) {
  const posts = [...postResponses];
  mockAuthFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/clinical-check-in/me/active" && (!init || !init.method)) {
      return jsonResponse(200, { active });
    }
    const next = posts.shift();
    if (!next) throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
    return next;
  });
}

function postedBodies(): { path: string; body: Record<string, unknown> | null }[] {
  return mockAuthFetch.mock.calls
    .filter(([, init]: [string, RequestInit | undefined]) => init?.method === "POST")
    .map(([path, init]: [string, RequestInit]) => ({
      path,
      body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
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

async function renderCard() {
  const { queryClient, Wrapper } = makeWrapper();
  const view = await render(<DoctorShiftStatusCard />, { wrapper: Wrapper });
  return { queryClient, view };
}

async function waitForStatus() {
  await waitFor(() => expect(screen.getByText("doctorGate.onShiftStatus")).toBeTruthy());
}

/** Press + async act flush — the repo's AssigneePicker pattern (React 19 concurrent). */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

type AlertButton = Readonly<{ text?: string; onPress?: () => void; style?: string }>;

/** The most recent Alert.alert button whose text matches the given key. */
function alertButton(textKey: string): AlertButton {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const buttons = calls[calls.length - 1][2] as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === textKey);
  expect(button).toBeTruthy();
  return button as AlertButton;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockUseIdentity.mockReset();
  mockTCalls.length = 0;
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe("DoctorShiftStatusCard — audience", () => {
  it("renders nothing and fetches nothing for a technician", async () => {
    mockUseIdentity.mockReturnValue({
      data: { effectiveRole: "technician" },
      isSuccess: true,
      isError: false,
    });
    const { view } = await renderCard();
    expect(view.toJSON()).toBeNull();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("renders nothing for a vet with no active check-in", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(null, []);
    await renderCard();
    await waitFor(() =>
      expect(mockAuthFetch).toHaveBeenCalledWith("/api/clinical-check-in/me/active", undefined),
    );
    expect(screen.queryByText("doctorGate.onShiftStatus")).toBeNull();
  });
});

describe("DoctorShiftStatusCard — status line", () => {
  it("shows the team status without the senior suffix for a non-senior row", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, []);
    await renderCard();
    await waitForStatus();
    expect(screen.queryByText("doctorGate.onShiftSenior")).toBeNull();
    // Interpolation wiring: the status line must pass the team label under {team}.
    expect(mockTCalls).toContainEqual([
      "doctorGate.onShiftStatus",
      { team: "doctorGate.teamIcu" },
    ]);
  });

  it("adds the senior suffix when the row isSenior", async () => {
    mockUseIdentity.mockReturnValue(SENIOR_VET);
    routeAuthFetch({ ...ACTIVE_ROW, isSenior: true }, []);
    await renderCard();
    await waitForStatus();
    expect(screen.getByText("doctorGate.onShiftSenior")).toBeTruthy();
  });
});

describe("DoctorShiftStatusCard — end shift", () => {
  it("confirm dialog → confirm posts /check-out and invalidates", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, [
      jsonResponse(200, { ...ACTIVE_ROW, checkedOutAt: "2026-08-13T14:00:00.000Z" }),
    ]);
    const { queryClient } = await renderCard();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await waitForStatus();

    await press(screen.getByText("doctorGate.endShift"));
    expect(postedBodies()).toHaveLength(0);
    expect(Alert.alert).toHaveBeenCalledWith(
      "doctorGate.endShiftConfirmTitle",
      "doctorGate.endShiftConfirmBody",
      expect.any(Array),
    );

    await act(async () => {
      alertButton("doctorGate.endShift").onPress?.();
    });

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0].path).toBe("/api/clinical-check-in/check-out");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clinical-check-in"] }),
    );
  });

  it("cancel posts nothing", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, []);
    await renderCard();
    await waitForStatus();

    await press(screen.getByText("doctorGate.endShift"));
    await act(async () => {
      alertButton("doctorGate.cancel").onPress?.();
    });

    expect(postedBodies()).toHaveLength(0);
  });

  it("a check-out failure alerts with the dedicated endShiftFailed copy and keeps the card", async () => {
    // The failing operation is ENDING the shift — the alert must not read
    // "Check-in failed" (review finding: opposite-of-intent copy).
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, [jsonResponse(500, { code: "INTERNAL" })]);
    await renderCard();
    await waitForStatus();

    await press(screen.getByText("doctorGate.endShift"));
    await act(async () => {
      alertButton("doctorGate.endShift").onPress?.();
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith("doctorGate.endShiftFailed"),
    );
    expect(screen.getByText("doctorGate.onShiftStatus")).toBeTruthy();
  });
});

describe("DoctorShiftStatusCard — switch role", () => {
  it("a team tap posts /switch with the row's isSenior default + source stamp", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, [jsonResponse(200, { ...ACTIVE_ROW, operationalRole: "admission" })]);
    const { queryClient } = await renderCard();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    await waitForStatus();

    await press(screen.getByText("doctorGate.switchRole"));
    await waitFor(() => expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy());
    await press(screen.getByText("doctorGate.teamAdmission"));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0]).toEqual({
      path: "/api/clinical-check-in/switch",
      body: { operationalRole: "admission", isSenior: false, source: "doctor_gate" },
    });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clinical-check-in"] }),
    );
    await waitFor(() => expect(screen.queryByText("doctorGate.pickTeam")).toBeNull());
  });

  it("hides the senior toggle when seniorDoctorEligible is falsy", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, []);
    await renderCard();
    await waitForStatus();

    await press(screen.getByText("doctorGate.switchRole"));

    expect(screen.queryByText("doctorGate.iAmSenior")).toBeNull();
  });

  it("senior toggle defaults to the active row's isSenior and drives the post", async () => {
    mockUseIdentity.mockReturnValue(SENIOR_VET);
    routeAuthFetch({ ...ACTIVE_ROW, isSenior: true }, [
      jsonResponse(200, { ...ACTIVE_ROW, operationalRole: "admission", isSenior: true }),
    ]);
    await renderCard();
    await waitForStatus();

    await press(screen.getByText("doctorGate.switchRole"));
    const toggle = screen.getByLabelText("doctorGate.iAmSenior");
    expect(toggle.props.accessibilityState.checked).toBe(true);
    await press(screen.getByText("doctorGate.teamAdmission"));

    await waitFor(() => expect(postedBodies()).toHaveLength(1));
    expect(postedBodies()[0].body).toEqual({
      operationalRole: "admission",
      isSenior: true,
      source: "doctor_gate",
    });
  });
});

describe("DoctorShiftStatusCard — SENIOR_ALREADY_ASSIGNED replace flow", () => {
  const conflict409 = (currentSeniorName: string | null) =>
    jsonResponse(409, {
      code: "SENIOR_ALREADY_ASSIGNED",
      details: { currentSeniorName },
    });

  async function driveToConflict(name: string | null) {
    mockUseIdentity.mockReturnValue(SENIOR_VET);
    routeAuthFetch(ACTIVE_ROW, [
      conflict409(name),
      jsonResponse(200, { ...ACTIVE_ROW, operationalRole: "admission", isSenior: true }),
    ]);
    await renderCard();
    await waitForStatus();
    await press(screen.getByText("doctorGate.switchRole"));
    await press(screen.getByLabelText("doctorGate.iAmSenior"));
    await press(screen.getByText("doctorGate.teamAdmission"));
    await waitFor(() => expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy());
  }

  it("shows the named body and retries /switch with replaceSenior:true on החלף", async () => {
    await driveToConflict("Dr. Shapiro");
    expect(screen.getByText("doctorGate.replaceSeniorBody")).toBeTruthy();

    await press(screen.getByText("doctorGate.replace"));

    await waitFor(() => expect(postedBodies()).toHaveLength(2));
    expect(postedBodies()[1]).toEqual({
      path: "/api/clinical-check-in/switch",
      body: {
        operationalRole: "admission",
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
  });

  it("ביטול returns to the team pick", async () => {
    await driveToConflict("Dr. Shapiro");

    await press(screen.getByText("doctorGate.cancel"));

    await waitFor(() => expect(screen.queryByText("doctorGate.replaceSeniorTitle")).toBeNull());
    expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy();
    expect(postedBodies()).toHaveLength(1);
  });

  it("a non-409 replace failure keeps the replace step and shows checkInFailed", async () => {
    // Review finding: the replace step previously swallowed non-conflict
    // errors — buttons re-enabled with zero visible feedback.
    mockUseIdentity.mockReturnValue(SENIOR_VET);
    routeAuthFetch(ACTIVE_ROW, [
      conflict409("Dr. Shapiro"),
      jsonResponse(500, { code: "INTERNAL" }),
    ]);
    await renderCard();
    await waitForStatus();
    await press(screen.getByText("doctorGate.switchRole"));
    await press(screen.getByLabelText("doctorGate.iAmSenior"));
    await press(screen.getByText("doctorGate.teamAdmission"));
    await waitFor(() => expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy());

    await press(screen.getByText("doctorGate.replace"));

    await waitFor(() => expect(screen.getByText("doctorGate.checkInFailed")).toBeTruthy());
    expect(screen.getByText("doctorGate.replaceSeniorTitle")).toBeTruthy();
    expect(screen.queryByText("doctorGate.pickTeam")).toBeNull();
  });
});

describe("DoctorShiftStatusCard — generic switch failure", () => {
  it("shows checkInFailed and keeps the sheet mounted", async () => {
    mockUseIdentity.mockReturnValue(VET);
    routeAuthFetch(ACTIVE_ROW, [jsonResponse(500, { code: "INTERNAL" })]);
    await renderCard();
    await waitForStatus();

    await press(screen.getByText("doctorGate.switchRole"));
    await press(screen.getByText("doctorGate.teamInternalMedicine"));

    await waitFor(() => expect(screen.getByText("doctorGate.checkInFailed")).toBeTruthy());
    expect(screen.getByText("doctorGate.pickTeam")).toBeTruthy();
  });
});
