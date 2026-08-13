/**
 * Doctor shift gate (vet-only) — "are you on shift?" → team pick (ICU / קבלה /
 * פנימית) → optional senior takeover, POSTing the vettrack clinical-check-in
 * contract with the REQUIRED `source: "doctor_gate"` provenance stamp (the api
 * module adds it to both check-in and the replace retry).
 *
 * Presentation: the ShiftAdjustmentSheet pattern — an RN transparent Modal
 * hosting the `BottomSheet` primitive (navigation files frozen, no new route).
 * Blur budget: the sheet's T2 glass exists only while the modal is open.
 *
 * Behavior contract (plan Task 4 + the PR #180 contract delta + review wave):
 *   - Audience is `effectiveRole === "vet"` exactly; everyone else renders null
 *     and the active-check-in query never fires.
 *   - Visibility is FAIL-CLOSED on the active-check-in lookup (vettrack
 *     `useDoctorGateState` mirror): an errored GET never shows the gate — the
 *     fail-open carve-out applies to /users/me eligibility ONLY.
 *   - Session latch: once an active check-in has been OBSERVED this session,
 *     the gate is answered — end-shift / admin force-close / 14h auto-expiry
 *     flipping the query to null must NOT pop the gate over the vet's screen.
 *   - "לא" writes the 8h MMKV snooze and dismisses; drag-down/back dismisses
 *     WITHOUT snoozing (the gate may ask again next session).
 *   - Senior toggle renders only for `seniorDoctorEligible === true`
 *     (EmergencyToggle shape — but PressableScale, this is not a danger
 *     surface); `isSenior` is sent from the toggle state, NOT gated on
 *     eligibility having loaded — the server enforces with 403
 *     SENIOR_NOT_ELIGIBLE.
 *   - `eligibilityPending` (Task 3): while /users/me hasn't settled the team
 *     buttons are disabled so an eligible senior cannot commit before the
 *     toggle could render. Settled-with-error counts as settled (fail-open).
 *   - 409 SENIOR_ALREADY_ASSIGNED → replace-confirm held in EXPLICIT step
 *     state (the SwitchStep pattern) so the confirm view stays mounted across
 *     the retry; a null `details.currentSeniorName` (race path) renders the
 *     generic body. החלף retries the SAME team with `replaceSenior: true`;
 *     ביטול returns to the pick. A non-conflict retry failure keeps the
 *     replace view and shows the checkInFailed note.
 *   - 409 ALREADY_CHECKED_IN is success-shaped (a row was opened elsewhere,
 *     e.g. the web app): invalidate + dismiss — never a retry-forever error.
 *   - Success → invalidate the canonical `clinicalCheckInKeys.all` + dismiss.
 *
 * Android: the BottomSheet's RNGH Pan gesture requires its own
 * `GestureHandlerRootView` INSIDE the native Modal (a Modal's content mounts
 * outside the RN root view on Android, detaching it from App.tsx's root).
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { Modal, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIdentity } from "@/app/useIdentity";
import { PressableScale } from "@/components/PressableScale";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  clinicalCheckInApi,
  clinicalCheckInKeys,
  isAlreadyCheckedIn,
  readSeniorConflict,
  type DoctorTeamRole,
  type OpenCheckInInput,
} from "@/lib/api/clinical-check-in";

import { resolveDoctorGateView, readGateSnooze, writeGateSnooze } from "./doctor-gate-derive";

/**
 * Typed against the generated i18n key union — server team value → label key.
 * Exported for the status card (Task 5): one label source per team value.
 */
export const TEAM_LABEL_KEYS = {
  icu: "doctorGate.teamIcu",
  admission: "doctorGate.teamAdmission",
  internal_medicine: "doctorGate.teamInternalMedicine",
} as const satisfies Record<DoctorTeamRole, string>;

export const TEAM_OPTIONS = ["icu", "admission", "internal_medicine"] as const satisfies readonly DoctorTeamRole[];

/** Static style for the modal-scoped GestureHandlerRootView (third-party — no className). */
const FLEX_1 = { flex: 1 } as const;

/** Yes/No chip on the ask step — KindSegment geometry, side-by-side. */
function AskChip({
  label,
  emphasized,
  onPress,
}: Readonly<{ label: string; emphasized: boolean; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`min-h-[44px] flex-1 items-center justify-center rounded-[16px] border px-3 py-2.5 ${
        emphasized ? "border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)]" : "border-border bg-surface"
      }`}
      onPress={onPress}
    >
      <Text
        className={`font-rubik-semibold text-[15px] ${emphasized ? "text-foreground" : "text-muted"}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Senior takeover switch — the EmergencyToggle row shape, non-danger accents.
 * Exported for the status card's switch sheet (Task 5).
 */
export function SeniorToggle({
  isSenior,
  onToggle,
}: Readonly<{ isSenior: boolean; onToggle: () => void }>) {
  const { t } = useTranslation();
  return (
    <PressableScale
      accessibilityRole="switch"
      accessibilityState={{ checked: isSenior }}
      accessibilityLabel={t("doctorGate.iAmSenior")}
      onPress={onToggle}
      className={`min-h-[48px] flex-row items-center justify-between rounded-[16px] px-4 py-3 ${
        isSenior
          ? "border border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)]"
          : "border border-border bg-surface"
      }`}
    >
      <Text
        className={`font-rubik-semibold text-[15px] ${isSenior ? "text-foreground" : "text-muted"}`}
      >
        {t("doctorGate.iAmSenior")}
      </Text>
      <Text className={`font-rubik-bold text-[14px] ${isSenior ? "text-foreground" : "text-muted"}`}>
        {isSenior ? "●" : "○"}
      </Text>
    </PressableScale>
  );
}

type GateContentProps = Readonly<{
  seniorEligible: boolean;
  /** /users/me not settled yet — team commit blocked (Task 3 contract). */
  eligibilityPending: boolean;
  onDecline: () => void;
  onComplete: () => void;
}>;

/**
 * Explicit step state (the status card's SwitchStep pattern): the replace
 * confirm is a STATE, not a live-mutation-derived view — pressing החלף resets
 * the mutation to pending, which must not collapse the confirm back to the
 * team pick mid-retry (review findings 3/6).
 */
type GateStep =
  | { kind: "ask" }
  | { kind: "pick" }
  | { kind: "replace"; team: DoctorTeamRole; currentSeniorName: string | null };

function GateContent({
  seniorEligible,
  eligibilityPending,
  onDecline,
  onComplete,
}: GateContentProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<GateStep>({ kind: "ask" });
  const [isSenior, setIsSenior] = useState(false);

  const checkIn = useMutation({
    mutationFn: (input: OpenCheckInInput) => clinicalCheckInApi.open(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clinicalCheckInKeys.all });
      onComplete();
    },
    onError: (err: unknown, variables) => {
      if (isAlreadyCheckedIn(err)) {
        // Success-shaped: a row was opened elsewhere (web app) while the gate
        // was up — reconcile + dismiss; retrying can never succeed.
        void queryClient.invalidateQueries({ queryKey: clinicalCheckInKeys.all });
        onComplete();
        return;
      }
      const conflict = readSeniorConflict(err);
      if (conflict !== null) {
        setStep({
          kind: "replace",
          team: variables.operationalRole,
          currentSeniorName: conflict.currentSeniorName,
        });
      }
    },
  });

  const commitBlocked = eligibilityPending || checkIn.isPending;
  /** A settled non-conflict failure (conflicts route to the replace step). */
  const failedGeneric = checkIn.isError && readSeniorConflict(checkIn.error) === null;

  const commitTeam = (team: DoctorTeamRole) => {
    if (commitBlocked) return;
    checkIn.mutate({ operationalRole: team, isSenior });
  };

  if (step.kind === "ask") {
    return (
      <View className="gap-3.5">
        <Text className="text-center font-rubik-bold text-[17px] text-foreground">
          {t("doctorGate.areYouOnShift")}
        </Text>
        <View className="flex-row gap-2">
          <AskChip
            label={t("doctorGate.yes")}
            emphasized
            onPress={() => setStep({ kind: "pick" })}
          />
          <AskChip label={t("doctorGate.no")} emphasized={false} onPress={onDecline} />
        </View>
      </View>
    );
  }

  if (step.kind === "replace") {
    const team = t(TEAM_LABEL_KEYS[step.team]);
    return (
      <View className="gap-3.5">
        <Text className="text-center font-rubik-bold text-[17px] text-foreground">
          {t("doctorGate.replaceSeniorTitle")}
        </Text>
        <Text className="text-center font-rubik text-[14px] text-muted">
          {step.currentSeniorName !== null
            ? t("doctorGate.replaceSeniorBody", { name: step.currentSeniorName, team })
            : t("doctorGate.replaceSeniorBodyGeneric", { team })}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("doctorGate.replace")}
          accessibilityState={{ disabled: checkIn.isPending }}
          disabled={checkIn.isPending}
          className={`min-h-[48px] items-center justify-center rounded-[16px] border border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)] px-4 py-3 ${
            checkIn.isPending ? "opacity-60" : ""
          }`}
          onPress={() =>
            checkIn.mutate({ operationalRole: step.team, isSenior, replaceSenior: true })
          }
        >
          <Text className="font-rubik-semibold text-[15px] text-foreground">
            {t("doctorGate.replace")}
          </Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("doctorGate.cancel")}
          className="min-h-[44px] items-center justify-center"
          onPress={() => {
            checkIn.reset();
            setStep({ kind: "pick" });
          }}
        >
          <Text className="font-rubik-semibold text-[14px] text-muted">
            {t("doctorGate.cancel")}
          </Text>
        </PressableScale>
        {failedGeneric ? (
          <Text className="text-center font-rubik-semibold text-[13px] text-danger">
            {t("doctorGate.checkInFailed")}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="gap-3.5">
      <Text className="text-center font-rubik-bold text-[17px] text-foreground">
        {t("doctorGate.pickTeam")}
      </Text>

      {seniorEligible ? (
        <SeniorToggle isSenior={isSenior} onToggle={() => setIsSenior((value) => !value)} />
      ) : null}

      <View className="gap-2">
        {TEAM_OPTIONS.map((team) => (
          <PressableScale
            key={team}
            accessibilityRole="button"
            accessibilityLabel={t(TEAM_LABEL_KEYS[team])}
            accessibilityState={{ disabled: commitBlocked }}
            disabled={commitBlocked}
            className={`min-h-[48px] items-center justify-center rounded-[16px] border border-border bg-surface px-4 py-3 ${
              commitBlocked ? "opacity-60" : ""
            }`}
            onPress={() => commitTeam(team)}
          >
            <Text className="font-rubik-semibold text-[15px] text-foreground">
              {t(TEAM_LABEL_KEYS[team])}
            </Text>
          </PressableScale>
        ))}
      </View>

      {failedGeneric ? (
        <Text className="text-center font-rubik-semibold text-[13px] text-danger">
          {t("doctorGate.checkInFailed")}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Self-contained gate host — mount once (MainTabs, Task 5). Renders null for
 * every non-vet identity; for vets it resolves visibility from the active
 * check-in query + the MMKV snooze via the pure Task-3 derivation.
 */
export function DoctorShiftGate(): ReactElement | null {
  const identity = useIdentity();
  const isVet = identity.data?.effectiveRole === "vet";

  const activeQuery = useQuery({
    queryKey: clinicalCheckInKeys.active,
    queryFn: clinicalCheckInApi.active,
    enabled: isVet,
  });

  const [snoozeUntilMs, setSnoozeUntilMs] = useState<number | null>(() => readGateSnooze());
  /** Mount-time clock snapshot (render purity) — the snooze check is 8h-granular. */
  const [mountedAtMs] = useState(() => Date.now());
  /** Session-local dismissal (לא, drag-down, back, or a completed check-in). */
  const [dismissed, setDismissed] = useState(false);

  const hasActiveCheckIn = activeQuery.data?.active != null;
  // Session latch (review finding 5): an observed active check-in answers the
  // gate for this session — when end-shift / force-close / auto-expiry later
  // flips the query to null, the gate must NOT pop over the vet's screen.
  // Guarded render-time adjustment (react.dev "adjusting state when props
  // change") instead of an effect: converges in one re-render, latches before
  // paint, and satisfies react-hooks/set-state-in-effect.
  if (hasActiveCheckIn && !dismissed) setDismissed(true);

  if (!isVet) return null;

  const resolution = resolveDoctorGateView({
    effectiveRole: identity.data?.effectiveRole,
    // FAIL-CLOSED (vettrack mirror): an errored lookup never shows the gate.
    // The fail-open carve-out applies to /users/me eligibility only.
    activeLoaded: activeQuery.isSuccess,
    hasActiveCheckIn,
    eligibilitySettled: identity.isSuccess || identity.isError,
    snoozeUntilMs,
    nowMs: mountedAtMs,
  });
  const visible = resolution.view === "ask" && !dismissed;

  const dismiss = () => setDismissed(true);
  const declineAndSnooze = () => {
    const now = Date.now();
    writeGateSnooze(now);
    setSnoozeUntilMs(readGateSnooze() ?? now);
    setDismissed(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {visible ? (
        // Android: RNGH gestures inside a native Modal need their own root
        // view — the Modal's content mounts outside App.tsx's
        // GestureHandlerRootView (RNGH docs; review finding 7).
        <GestureHandlerRootView style={FLEX_1}>
          <BottomSheet onDismiss={dismiss}>
            <GateContent
              seniorEligible={identity.data?.seniorDoctorEligible === true}
              eligibilityPending={resolution.eligibilityPending}
              onDecline={declineAndSnooze}
              onComplete={dismiss}
            />
          </BottomSheet>
        </GestureHandlerRootView>
      ) : null}
    </Modal>
  );
}
