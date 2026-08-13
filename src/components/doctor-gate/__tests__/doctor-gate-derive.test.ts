/**
 * Pure-unit tests for the doctor shift gate's view derivation + MMKV snooze
 * helpers (mirrors bootstrap-view.test.ts style). The gate asks ONLY a vet
 * with a settled, empty active-check-in query and no live snooze.
 *
 * Contract delta (vettrack PR #180 rounds): the derive exposes
 * `eligibilityPending` so the sheet can wait for /users/me to settle
 * (fail-open on error) before letting the user commit a team — an eligible
 * senior must not be able to commit before the senior toggle could render.
 */
import {
  DOCTOR_GATE_SNOOZE_KEY,
  DOCTOR_GATE_SNOOZE_MS,
  readGateSnooze,
  resolveDoctorGateView,
  writeGateSnooze,
} from "../doctor-gate-derive";

const mockGet = jest.fn((_key: string, _kind?: string): string | null => null);
const mockSet = jest.fn((_key: string, _value: string, _kind?: string): boolean => true);

jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string, kind?: string) => mockGet(key, kind),
  safeStorageSetItem: (key: string, value: string, kind?: string) => mockSet(key, value, kind),
  safeStorageRemoveItem: jest.fn((): boolean => true),
}));

const NOW = 1_755_000_000_000;

const vetAskArgs = {
  effectiveRole: "vet",
  activeLoaded: true,
  hasActiveCheckIn: false,
  eligibilitySettled: true,
  snoozeUntilMs: null,
  nowMs: NOW,
} as const;

beforeEach(() => {
  mockGet.mockReset().mockReturnValue(null);
  mockSet.mockReset().mockReturnValue(true);
});

describe("constants", () => {
  it("pins the storage key and 8h snooze window", () => {
    expect(DOCTOR_GATE_SNOOZE_KEY).toBe("vt.doctorGate.snoozeUntil");
    expect(DOCTOR_GATE_SNOOZE_MS).toBe(8 * 3_600_000);
  });
});

describe("resolveDoctorGateView", () => {
  it("asks a vet with a settled empty active query and no snooze", () => {
    expect(resolveDoctorGateView(vetAskArgs)).toEqual({
      view: "ask",
      eligibilityPending: false,
    });
  });

  it("hides for a technician", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, effectiveRole: "technician" }).view).toBe(
      "hidden",
    );
  });

  it("hides for an admin (server rejects with ROLE_NOT_ELIGIBLE_FOR_CHECK_IN)", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, effectiveRole: "admin" }).view).toBe("hidden");
  });

  it("hides while identity role is still unknown", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, effectiveRole: undefined }).view).toBe("hidden");
  });

  it("hides a vet who already has an active check-in", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, hasActiveCheckIn: true }).view).toBe("hidden");
  });

  it("hides while the active-check-in query has not settled", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, activeLoaded: false }).view).toBe("hidden");
  });

  it("hides under a live snooze", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, snoozeUntilMs: NOW + 1 }).view).toBe("hidden");
  });

  it("asks again once the snooze expired", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, snoozeUntilMs: NOW }).view).toBe("ask");
    expect(resolveDoctorGateView({ ...vetAskArgs, snoozeUntilMs: NOW - 1 }).view).toBe("ask");
  });

  it("flags eligibilityPending while asking before /users/me settled", () => {
    expect(resolveDoctorGateView({ ...vetAskArgs, eligibilitySettled: false })).toEqual({
      view: "ask",
      eligibilityPending: true,
    });
  });

  it("never flags eligibilityPending when the gate is hidden", () => {
    expect(
      resolveDoctorGateView({
        ...vetAskArgs,
        effectiveRole: "technician",
        eligibilitySettled: false,
      }),
    ).toEqual({ view: "hidden", eligibilityPending: false });
  });
});

describe("readGateSnooze", () => {
  it("returns the stored epoch-ms value", () => {
    mockGet.mockReturnValue(String(NOW));
    expect(readGateSnooze()).toBe(NOW);
    expect(mockGet).toHaveBeenCalledWith(DOCTOR_GATE_SNOOZE_KEY, undefined);
  });

  it("returns null when nothing is stored", () => {
    expect(readGateSnooze()).toBeNull();
  });

  it("treats a malformed stored value as null", () => {
    mockGet.mockReturnValue("not-a-number");
    expect(readGateSnooze()).toBeNull();
  });

  it("treats a non-positive stored value as null", () => {
    mockGet.mockReturnValue("-42");
    expect(readGateSnooze()).toBeNull();
  });

  it("returns null when storage throws (StorageUnavailableError path)", () => {
    mockGet.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readGateSnooze()).toBeNull();
  });
});

describe("writeGateSnooze", () => {
  it("stores now + 8h as a string under the pinned key", () => {
    writeGateSnooze(NOW);
    expect(mockSet).toHaveBeenCalledWith(
      DOCTOR_GATE_SNOOZE_KEY,
      String(NOW + DOCTOR_GATE_SNOOZE_MS),
      undefined,
    );
  });

  it("is best-effort: a storage throw is swallowed", () => {
    mockSet.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => writeGateSnooze(NOW)).not.toThrow();
  });
});
