/**
 * Vet on-shift status card (Task 5) — Home header surface mirroring the
 * vettrack `DoctorShiftStatus` client (feat/doctor-shift-gate). Renders only
 * for a vet whose open clinical check-in carries a doctor team role: the
 * status line (team label + senior marker), an end-shift action behind a
 * native confirm dialog (server-confirmed close, never optimistic), and a
 * switch-role action on the transaction-safe /switch endpoint (atomic
 * close+open — the card NEVER issues close-then-open itself).
 *
 * Contract mirrors (PR #180 review rounds):
 *   - `isSenior` on switch is the toggle state alone, defaulting to the active
 *     row's isSenior — NOT ANDed with client-side eligibility (that would
 *     silently demote an active senior while /users/me is pending; the server
 *     enforces with 403 SENIOR_NOT_ELIGIBLE). The toggle row itself renders
 *     only for `seniorDoctorEligible === true`.
 *   - 409 SENIOR_ALREADY_ASSIGNED → replace-confirm; `currentSeniorName` may
 *     be null (race path) → generic body. החלף retries the SAME team with
 *     `{isSenior: true, replaceSenior: true}`; ביטול returns to the pick.
 *   - The api module stamps `source: "doctor_gate"` on both switch calls.
 *   - Success → invalidate the canonical `clinicalCheckInKeys.all`.
 *
 * Presentation: opaque home-card recipe inside the `px-[22px]` gutter (blur
 * budget untouched — the switch sheet's T2 glass exists only while its
 * transient Modal is open, the ShiftAdjustmentSheet precedent).
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { Alert, Modal, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIdentity } from "@/app/useIdentity";
import { PressableScale } from "@/components/PressableScale";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  clinicalCheckInApi,
  clinicalCheckInKeys,
  readSeniorConflict,
  type CheckInRow,
  type DoctorTeamRole,
  type OpenCheckInInput,
} from "@/lib/api/clinical-check-in";

import { SeniorToggle, TEAM_LABEL_KEYS, TEAM_OPTIONS } from "./DoctorShiftGate";

type SwitchStep =
  | { kind: "closed" }
  | { kind: "pick" }
  | { kind: "replace"; team: DoctorTeamRole; currentSeniorName: string | null };

/** Static style for the modal-scoped GestureHandlerRootView (third-party — no className). */
const FLEX_1 = { flex: 1 } as const;

/** Outline action chip — the card's two equal-width actions. */
function ActionChip({
  label,
  disabled,
  onPress,
}: Readonly<{ label: string; disabled: boolean; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`min-h-[44px] flex-1 items-center justify-center rounded-[16px] border border-border bg-surface px-3 py-2.5 ${
        disabled ? "opacity-60" : ""
      }`}
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[14px] text-foreground">{label}</Text>
    </PressableScale>
  );
}

function SwitchSheetContent({
  active,
  seniorEligible,
  onClose,
}: Readonly<{ active: CheckInRow; seniorEligible: boolean; onClose: () => void }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Exclude<SwitchStep, { kind: "closed" }>>({ kind: "pick" });
  // Toggle default: keep the caller's current senior state until they touch it.
  const [wantSenior, setWantSenior] = useState<boolean | null>(null);
  const isSeniorChecked = wantSenior ?? active.isSenior;

  const switchMutation = useMutation({
    mutationFn: (input: OpenCheckInInput) => clinicalCheckInApi.switchRole(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clinicalCheckInKeys.all });
      onClose();
    },
    onError: (err: unknown, variables) => {
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

  // A settled non-conflict failure — surfaced in BOTH steps (a replace retry
  // failing with a network error/500 must not leave the replace step silent).
  const failedGeneric =
    switchMutation.isError && readSeniorConflict(switchMutation.error) === null;

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
          accessibilityState={{ disabled: switchMutation.isPending }}
          disabled={switchMutation.isPending}
          className={`min-h-[48px] items-center justify-center rounded-[16px] border border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)] px-4 py-3 ${
            switchMutation.isPending ? "opacity-60" : ""
          }`}
          onPress={() =>
            switchMutation.mutate({
              operationalRole: step.team,
              isSenior: true,
              replaceSenior: true,
            })
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
            switchMutation.reset();
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
        <SeniorToggle
          isSenior={isSeniorChecked}
          onToggle={() => setWantSenior(!isSeniorChecked)}
        />
      ) : null}

      <View className="gap-2">
        {TEAM_OPTIONS.map((team) => (
          <PressableScale
            key={team}
            accessibilityRole="button"
            accessibilityLabel={t(TEAM_LABEL_KEYS[team])}
            accessibilityState={{ disabled: switchMutation.isPending }}
            disabled={switchMutation.isPending}
            className={`min-h-[48px] items-center justify-center rounded-[16px] border border-border bg-surface px-4 py-3 ${
              switchMutation.isPending ? "opacity-60" : ""
            }`}
            onPress={() =>
              switchMutation.mutate({ operationalRole: team, isSenior: isSeniorChecked })
            }
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
 * Self-contained — mount in Home's ListHeaderComponent. Null for every
 * non-vet identity and for a vet without an open doctor-team check-in.
 */
export function DoctorShiftStatusCard(): ReactElement | null {
  const { t } = useTranslation();
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const isVet = identity.data?.effectiveRole === "vet";

  const activeQuery = useQuery({
    queryKey: clinicalCheckInKeys.active,
    queryFn: clinicalCheckInApi.active,
    enabled: isVet,
  });

  const [switchOpen, setSwitchOpen] = useState(false);
  const closeSwitch = () => setSwitchOpen(false);

  const endShift = useMutation({
    mutationFn: () => clinicalCheckInApi.close(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clinicalCheckInKeys.all });
    },
    onError: () => {
      // Dedicated copy — the failing operation is ENDING the shift, not a
      // check-in (review finding: opposite-of-intent message).
      Alert.alert(t("doctorGate.endShiftFailed"));
    },
  });

  const active = activeQuery.data?.active ?? null;
  // Legacy rows may carry a non-gate operationalRole — the card owns only the
  // doctor-team taxonomy (mirror of the vettrack isDoctorTeamRole guard).
  const team =
    active !== null ? TEAM_OPTIONS.find((option) => option === active.operationalRole) : undefined;

  if (!isVet || active === null || team === undefined) return null;

  const confirmEndShift = () => {
    // Server-confirmed close behind an explicit confirm — mirror of the
    // vettrack useConfirm dialog (endShiftConfirmTitle/Body, endShift label).
    Alert.alert(t("doctorGate.endShiftConfirmTitle"), t("doctorGate.endShiftConfirmBody"), [
      { text: t("doctorGate.cancel"), style: "cancel" },
      {
        text: t("doctorGate.endShift"),
        style: "destructive",
        onPress: () => endShift.mutate(),
      },
    ]);
  };

  return (
    <View className="px-[22px] pt-2.5">
      <View className="rounded-[24px] border border-border bg-surface px-5 py-3.5">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="font-rubik-semibold text-[14px] text-foreground">
            {t("doctorGate.onShiftStatus", { team: t(TEAM_LABEL_KEYS[team]) })}
          </Text>
          {active.isSenior ? (
            <Text className="font-rubik text-[13px] text-muted">
              {t("doctorGate.onShiftSenior")}
            </Text>
          ) : null}
        </View>
        <View className="mt-2.5 flex-row gap-2">
          <ActionChip
            label={t("doctorGate.switchRole")}
            disabled={endShift.isPending}
            onPress={() => setSwitchOpen(true)}
          />
          <ActionChip
            label={t("doctorGate.endShift")}
            disabled={endShift.isPending}
            onPress={confirmEndShift}
          />
        </View>
      </View>

      <Modal
        visible={switchOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeSwitch}
      >
        {switchOpen ? (
          // Android: RNGH gestures inside a native Modal need their own root
          // view (see DoctorShiftGate's note; review finding 7).
          <GestureHandlerRootView style={FLEX_1}>
            <BottomSheet onDismiss={closeSwitch}>
              <SwitchSheetContent
                active={active}
                seniorEligible={identity.data?.seniorDoctorEligible === true}
                onClose={closeSwitch}
              />
            </BottomSheet>
          </GestureHandlerRootView>
        ) : null}
      </Modal>
    </View>
  );
}
