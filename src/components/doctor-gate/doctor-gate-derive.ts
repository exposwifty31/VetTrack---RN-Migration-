import { safeStorageGetItem, safeStorageSetItem } from "@/lib/safe-storage";

export const DOCTOR_GATE_SNOOZE_KEY = "vt.doctorGate.snoozeUntil";
export const DOCTOR_GATE_SNOOZE_MS = 8 * 3_600_000;

export type DoctorGateView = "hidden" | "ask";

export type DoctorGateResolution = Readonly<{
  view: DoctorGateView;
  /**
   * True while the gate is asking but GET /users/me has not settled yet.
   * The sheet may render, but team commit must wait for eligibility so an
   * eligible senior cannot miss the senior toggle. Callers treat a settled
   * ERROR as settled too (fail-open) — the server still enforces eligibility
   * with 403 SENIOR_NOT_ELIGIBLE.
   */
  eligibilityPending: boolean;
}>;

export function resolveDoctorGateView(
  args: Readonly<{
    effectiveRole: string | undefined;
    /** The active-check-in query settled (success or error). */
    activeLoaded: boolean;
    hasActiveCheckIn: boolean;
    /** GET /users/me settled (success OR error — fail-open on error). */
    eligibilitySettled: boolean;
    snoozeUntilMs: number | null;
    nowMs: number;
  }>,
): DoctorGateResolution {
  const snoozed = args.snoozeUntilMs !== null && args.snoozeUntilMs > args.nowMs;
  const view: DoctorGateView =
    args.effectiveRole === "vet" && args.activeLoaded && !args.hasActiveCheckIn && !snoozed
      ? "ask"
      : "hidden";
  return { view, eligibilityPending: view === "ask" && !args.eligibilitySettled };
}

export function readGateSnooze(): number | null {
  try {
    const raw = safeStorageGetItem(DOCTOR_GATE_SNOOZE_KEY);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // StorageUnavailableError → behave as never snoozed
    return null;
  }
}

export function writeGateSnooze(nowMs: number): void {
  try {
    safeStorageSetItem(DOCTOR_GATE_SNOOZE_KEY, String(nowMs + DOCTOR_GATE_SNOOZE_MS));
  } catch {
    // best-effort: MMKV unavailable → the gate simply asks again next launch
  }
}
