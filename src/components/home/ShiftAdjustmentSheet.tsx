/**
 * Shift-adjustment request sheet (G3 Slice 5) — extend / leave-early with the
 * REQUIRED HH:MM end-time picker (server rejects a missing/invalid time with
 * INVALID_TIME) and the 3–500-char reason.
 *
 * Presentation: an RN transparent Modal hosting the Slice-1 `BottomSheet`
 * primitive — the navigation files are frozen post-Slice-1, so no new
 * transparentModal route. Blur budget note: the sheet's T2 glass exists only
 * while the modal is open; GlassTopBar (T1) remains the Home screen's own
 * single blur layer — within the ≤2-tier budget, matching the Tasks-sheet
 * precedent in G3-PLAN §2.
 *
 * The time picker is stepper-based (±15m / ±1h, midnight-wrapping) rather than
 * a native wheel: the repo has no datetimepicker dependency and G3 freezes the
 * native dependency set (CNG prebuild) — a JS stepper needs no prebuild.
 *
 * Validation mirrors the server's order (kind → time → reason → direction,
 * overnight-aware) via `validateAdjustmentRequest`; the server stays the
 * authority and its coded rejections render translated via
 * `adjustmentErrorKey`. No content/layout animation — the only motion is the
 * sheet's own rise + PressableScale feedback.
 */
import { useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ApiCodedError } from "@/lib/api/coded-error";
import { homeKeys } from "@/lib/api/home";
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  shiftAdjustmentKeys,
  shiftAdjustmentsApi,
  validateAdjustmentRequest,
  type ShiftAdjustmentKind,
} from "@/lib/api/shift-adjustments";

import { adjustmentErrorKey, shiftClockTime } from "./home-pulse-derive";

/** Default picker offset from the current shift end, per kind. */
const DEFAULT_OFFSET_MINUTES = 60;

function defaultTimeFor(kind: ShiftAdjustmentKind, shiftEnd: string | null): string {
  if (!shiftEnd) return kind === "extend" ? "20:00" : "14:00";
  return shiftClockTime(shiftEnd, kind === "extend" ? DEFAULT_OFFSET_MINUTES : -DEFAULT_OFFSET_MINUTES);
}

function StepButton({
  label,
  a11yLabel,
  onPress,
}: Readonly<{ label: string; a11yLabel: string; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="h-11 min-w-[44px] items-center justify-center rounded-[14px] border border-border bg-surface px-2"
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[13px] text-foreground" style={{ writingDirection: "ltr" }}>
        {label}
      </Text>
    </PressableScale>
  );
}

function KindSegment({
  kind,
  onChange,
}: Readonly<{ kind: ShiftAdjustmentKind; onChange: (kind: ShiftAdjustmentKind) => void }>) {
  const { t } = useTranslation();
  const options: readonly { value: ShiftAdjustmentKind; label: string }[] = [
    { value: "extend", label: t("shiftAdjustments.extend") },
    { value: "leave_early", label: t("shiftAdjustments.leaveEarly") },
  ];
  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const selected = option.value === kind;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            className={`min-h-[44px] flex-1 items-center justify-center rounded-[16px] border px-3 py-2.5 ${
              selected ? "border-[rgba(139,92,246,0.55)] bg-[rgba(124,58,237,0.14)]" : "border-border bg-surface"
            }`}
            onPress={() => onChange(option.value)}
          >
            <Text
              className={`font-rubik-semibold text-[13px] ${selected ? "text-foreground" : "text-muted"}`}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

type SheetContentProps = Readonly<{
  initialKind: ShiftAdjustmentKind;
  /** Active shift clock window (HH:MM, device-local frame) — null degrades to defaults. */
  shiftStart: string | null;
  shiftEnd: string | null;
  onClose: () => void;
}>;

function SheetContent({ initialKind, shiftStart, shiftEnd, onClose }: SheetContentProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ShiftAdjustmentKind>(initialKind);
  const [time, setTime] = useState<string>(() => defaultTimeFor(initialKind, shiftEnd));
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: shiftAdjustmentsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shiftAdjustmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: homeKeys.all });
      onClose();
    },
  });

  const onKindChange = (next: ShiftAdjustmentKind) => {
    setKind(next);
    // Event-driven reset (never an effect): a new direction gets its default.
    setTime(defaultTimeFor(next, shiftEnd));
    create.reset();
  };

  const shiftWindow =
    shiftStart && shiftEnd ? { startTime: shiftStart, endTime: shiftEnd } : undefined;
  const trimmedReason = reason.trim();
  const validation = validateAdjustmentRequest(
    { kind, requestedEndTime: time, reason: trimmedReason },
    shiftWindow,
  );
  // Direction feedback shows once a time is chosen; the reason hint covers itself.
  const directionErrorKey =
    !validation.ok && (validation.reason === "NOT_AN_EXTENSION" || validation.reason === "NOT_EARLIER")
      ? adjustmentErrorKey(validation.reason)
      : null;

  const serverErrorKey = create.isError
    ? adjustmentErrorKey(create.error instanceof ApiCodedError ? (create.error.reason ?? create.error.code) : null)
    : null;

  const submitDisabled = !validation.ok || create.isPending;

  return (
    <View className="gap-3.5">
      <Text className="font-rubik-bold text-[17px] text-foreground">
        {t("shiftAdjustments.request")}
      </Text>

      <KindSegment kind={kind} onChange={onKindChange} />

      <View>
        <Text className="mb-1.5 font-rubik text-[12.5px] text-muted">
          {t("shiftAdjustments.requestedEnd")}
        </Text>
        {/* LTR row: stepper order (-1h -15m time +15m +1h) must not mirror. */}
        <View className="flex-row items-center justify-center gap-2" style={{ direction: "ltr" }}>
          <StepButton
            label={t("shiftAdjustments.stepDownHour")}
            a11yLabel={t("shiftAdjustments.stepDownHourA11y")}
            onPress={() => setTime((current) => shiftClockTime(current, -60))}
          />
          <StepButton
            label={t("shiftAdjustments.stepDown")}
            a11yLabel={t("shiftAdjustments.stepDownA11y")}
            onPress={() => setTime((current) => shiftClockTime(current, -15))}
          />
          <View className="min-w-[86px] items-center rounded-[16px] border border-border bg-surface-raised px-4 py-2.5">
            <Text
              className="font-rubik-bold text-[22px] text-foreground"
              style={{ writingDirection: "ltr" }}
            >
              {time}
            </Text>
          </View>
          <StepButton
            label={t("shiftAdjustments.stepUp")}
            a11yLabel={t("shiftAdjustments.stepUpA11y")}
            onPress={() => setTime((current) => shiftClockTime(current, 15))}
          />
          <StepButton
            label={t("shiftAdjustments.stepUpHour")}
            a11yLabel={t("shiftAdjustments.stepUpHourA11y")}
            onPress={() => setTime((current) => shiftClockTime(current, 60))}
          />
        </View>
        {directionErrorKey ? (
          <Text className="mt-1.5 text-center font-rubik text-[12px] text-warning">
            {t(directionErrorKey)}
          </Text>
        ) : null}
      </View>

      <View>
        <TextInput
          className="min-h-[88px] rounded-[16px] border border-border bg-surface-raised px-4 py-3 font-rubik text-[14px] text-foreground"
          placeholder={t("shiftAdjustments.reason")}
          placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={REASON_MAX_LENGTH}
          accessibilityLabel={t("shiftAdjustments.reason")}
        />
        {trimmedReason.length < REASON_MIN_LENGTH ? (
          <Text className="mt-1 font-rubik text-[11.5px] text-muted">
            {t("shiftAdjustments.reasonHint", { min: REASON_MIN_LENGTH })}
          </Text>
        ) : null}
      </View>

      {serverErrorKey ? (
        <Text className="text-center font-rubik-semibold text-[13px] text-danger">
          {t(serverErrorKey)}
        </Text>
      ) : null}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("shiftAdjustments.submit")}
        accessibilityState={{ disabled: submitDisabled }}
        disabled={submitDisabled}
        className="overflow-hidden rounded-[20px]"
        onPress={() => create.mutate({ kind, requestedEndTime: time, reason: trimmedReason })}
      >
        <View
          className={`min-h-[48px] items-center justify-center rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-3 ${
            submitDisabled ? "opacity-60" : ""
          }`}
          style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
        >
          {/* AA: solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
          <Text className="font-rubik-semibold text-[16px] text-white">
            {t("shiftAdjustments.submit")}
          </Text>
        </View>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        className="min-h-[44px] items-center justify-center"
        onPress={onClose}
      >
        <Text className="font-rubik-semibold text-[14px] text-muted">{t("common.cancel")}</Text>
      </PressableScale>
    </View>
  );
}

type ShiftAdjustmentSheetProps = Readonly<{
  /** The kind the sheet opened for — null renders nothing (modal closed). */
  kind: ShiftAdjustmentKind | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  onClose: () => void;
}>;

export function ShiftAdjustmentSheet({
  kind,
  shiftStart,
  shiftEnd,
  onClose,
}: ShiftAdjustmentSheetProps) {
  return (
    <Modal
      visible={kind != null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {kind != null ? (
        <BottomSheet onDismiss={onClose}>
          {/* key remounts fresh state per opening kind — init via useState, no effects. */}
          <SheetContent
            key={kind}
            initialKind={kind}
            shiftStart={shiftStart}
            shiftEnd={shiftEnd}
            onClose={onClose}
          />
        </BottomSheet>
      ) : null}
    </Modal>
  );
}
