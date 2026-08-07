/**
 * Shift hero (G3 Slice 5) — the daily-pulse headline card: on-shift window /
 * next shift / streak / scans-today / tasks-completed, plus the
 * shift-adjustment entry points (request extend / leave-early, view + cancel
 * the pending request).
 *
 * Structured as small named children (HeroHeadline / AdjustmentControls /
 * PendingAdjustmentRow) so each piece owns exactly one decision — the
 * composition root stays branch-light (SonarCloud cognitive-complexity gate).
 *
 * Aurora: opaque `surface-raised` card (zero blur — the screen's single blur
 * stays GlassTopBar); counters render `writingDirection:"ltr"`; the only
 * motion is PressableScale press feedback. `dashboard` still loading renders
 * honest dashes; a failed load renders ErrorNote — never fabricated zeros.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { ErrorNote } from "@/components/ui/ErrorNote";
import type { ShiftAdjustment, ShiftAdjustmentKind } from "@/lib/api/shift-adjustments";
import { formatDateTime, formatTime } from "@/lib/datetime";

import type { ShiftHeroState } from "./home-pulse-derive";

function CounterColumn({
  value,
  label,
}: Readonly<{ value: number | null; label: string }>) {
  return (
    <View className="flex-1 items-center">
      <Text
        className="font-rubik-bold text-[17px] text-foreground"
        style={{ writingDirection: "ltr" }}
      >
        {value == null ? "—" : String(value)}
      </Text>
      <Text className="mt-[1px] font-rubik text-[10.5px] text-muted">{label}</Text>
    </View>
  );
}

function HeroHeadline({ state }: Readonly<{ state: ShiftHeroState }>) {
  const { t } = useTranslation();

  let headline: string;
  let subline: string | null = null;
  if (state.kind === "loading") {
    headline = t("common.loading");
  } else if (state.kind === "onShift") {
    headline = t("home.shift.onShift");
    const until = formatTime(state.endsAt);
    subline = until ? t("home.shift.until", { time: `⁦${until}⁩` }) : null;
  } else {
    headline = t("common.offShift");
    const next = formatDateTime(state.nextStartsAt);
    subline = next ? t("home.shift.nextShift", { time: `⁦${next}⁩` }) : t("home.shift.noUpcoming");
  }

  return (
    <View className="flex-row items-baseline gap-2.5">
      <Text className="font-rubik-bold text-[16px] text-foreground">{headline}</Text>
      <View className="flex-1" />
      {subline ? <Text className="font-rubik text-[12.5px] text-muted">{subline}</Text> : null}
    </View>
  );
}

function AdjustmentButton({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[44px] flex-1 items-center justify-center rounded-[16px] border border-border bg-surface px-3 py-2.5"
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[13px] text-foreground">{label}</Text>
    </PressableScale>
  );
}

/** HH:MM from the row's HH:MM:SS clock literal — display only. */
function clockLabel(time: string): string {
  return time.slice(0, 5);
}

function PendingAdjustmentRow({
  pending,
  cancelInFlight,
  onCancel,
}: Readonly<{
  pending: ShiftAdjustment;
  cancelInFlight: boolean;
  onCancel: (id: string) => void;
}>) {
  const { t } = useTranslation();
  const kindLabel =
    pending.kind === "extend" ? t("shiftAdjustments.extend") : t("shiftAdjustments.leaveEarly");

  return (
    <View className="mt-3.5 flex-row items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-2.5">
      <View className="flex-1">
        <Text className="font-rubik-semibold text-[13px] text-foreground">
          {t("shiftAdjustments.pending")}
        </Text>
        <Text className="mt-[1px] font-rubik text-[12px] text-muted">
          {kindLabel}
          {" · "}
          <Text style={{ writingDirection: "ltr" }}>{clockLabel(pending.requestedEndTime)}</Text>
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("shiftAdjustments.cancel")}
        accessibilityState={{ disabled: cancelInFlight }}
        disabled={cancelInFlight}
        className={`min-h-[44px] items-center justify-center rounded-[14px] border border-border px-4 ${
          cancelInFlight ? "opacity-60" : ""
        }`}
        onPress={() => onCancel(pending.id)}
      >
        <Text className="font-rubik-semibold text-[13px] text-muted">
          {t("shiftAdjustments.cancel")}
        </Text>
      </PressableScale>
    </View>
  );
}

/** On-shift only: the pending request row, or the two request entry points. */
function AdjustmentControls({
  pendingAdjustment,
  cancelInFlight,
  onRequestAdjustment,
  onCancelAdjustment,
}: Readonly<{
  pendingAdjustment: ShiftAdjustment | null;
  cancelInFlight: boolean;
  onRequestAdjustment: (kind: ShiftAdjustmentKind) => void;
  onCancelAdjustment: (id: string) => void;
}>) {
  const { t } = useTranslation();

  if (pendingAdjustment) {
    return (
      <PendingAdjustmentRow
        pending={pendingAdjustment}
        cancelInFlight={cancelInFlight}
        onCancel={onCancelAdjustment}
      />
    );
  }
  return (
    <View className="mt-3.5 flex-row gap-2.5">
      <AdjustmentButton
        label={t("shiftAdjustments.extend")}
        onPress={() => onRequestAdjustment("extend")}
      />
      <AdjustmentButton
        label={t("shiftAdjustments.leaveEarly")}
        onPress={() => onRequestAdjustment("leave_early")}
      />
    </View>
  );
}

type ShiftHeroCardProps = Readonly<{
  state: ShiftHeroState;
  streak: number | null;
  scansToday: number | null;
  tasksDone: number | null;
  /** The caller's pending adjustment request, when one exists. */
  pendingAdjustment: ShiftAdjustment | null;
  cancelInFlight: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  onRequestAdjustment: (kind: ShiftAdjustmentKind) => void;
  onCancelAdjustment: (id: string) => void;
}>;

export function ShiftHeroCard({
  state,
  streak,
  scansToday,
  tasksDone,
  pendingAdjustment,
  cancelInFlight,
  loadFailed,
  onRetry,
  onRequestAdjustment,
  onCancelAdjustment,
}: ShiftHeroCardProps) {
  const { t } = useTranslation();

  if (loadFailed) {
    return (
      <View className="px-[22px] pt-2.5">
        <View className="rounded-[24px] border border-border bg-surface-raised">
          <ErrorNote message={t("home.shift.loadError")} onRetry={onRetry} />
        </View>
      </View>
    );
  }

  return (
    <View className="px-[22px] pt-2.5">
      <View className="rounded-[24px] border border-border bg-surface-raised px-5 py-4">
        <HeroHeadline state={state} />

        <View className="mb-2.5 mt-3 h-px bg-[rgba(167,139,250,0.12)] light:bg-[#F0EDF8]" />

        <View className="flex-row">
          <CounterColumn value={streak} label={t("home.shift.streak")} />
          <CounterColumn value={scansToday} label={t("home.shift.scansToday")} />
          <CounterColumn value={tasksDone} label={t("home.shift.tasksDone")} />
        </View>

        {state.kind === "onShift" ? (
          <AdjustmentControls
            pendingAdjustment={pendingAdjustment}
            cancelInFlight={cancelInFlight}
            onRequestAdjustment={onRequestAdjustment}
            onCancelAdjustment={onCancelAdjustment}
          />
        ) : null}
      </View>
    </View>
  );
}
