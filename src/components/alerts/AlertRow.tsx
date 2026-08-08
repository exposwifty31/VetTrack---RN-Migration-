/**
 * Aurora alert row — an OPAQUE `--color-surface` card (rows never sit on glass).
 * Severity is a static semantic-token `Chip` (issue = danger solid fill, never
 * animated); the only motion is `PressableScale` press feedback on the navigate
 * zone and the action buttons. The card carries no danger-colored surface, so
 * nothing on it animates a danger fill.
 *
 * Two-level state (see `alerts-derive.ts`):
 *   unclaimed → "I'm handling this" (acknowledge)
 *   handling  → who's handling + "Mark resolved" (opens the resolve sheet)
 *   resolved  → resolved-when + reopen hint + "I'm handling this" (re-acknowledge)
 *
 * Action affordances render only for `canManage` (senior_technician+); reads are
 * universal, so a sub-senior sees the state line but no buttons.
 */
import { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { Chip } from "@/components/ui/Chip";
import { alertTone, type AlertType, type AlertViewRow } from "@/lib/alerts-derive";
import { formatDateTime } from "@/lib/datetime";
import { haptics } from "@/lib/haptics";

type TFn = ReturnType<typeof useTranslation>["t"];

/** First-Strong Isolate / Pop Directional Isolate — wrap a name/email that may be
 *  Latin so it renders LTR inside the RTL sentence without leaking direction. */
function isolate(value: string): string {
  return `⁨${value}⁩`;
}

const TYPE_LABEL_KEY = {
  issue: "alerts.type.issue",
  overdue: "alerts.type.overdue",
  sterilization_due: "alerts.type.sterilizationDue",
  inactive: "alerts.type.inactive",
} as const satisfies Record<AlertType, string>;

function detailText(row: AlertViewRow, t: TFn): string {
  switch (row.alert.type) {
    case "issue":
      return t("alerts.detail.issue");
    case "overdue":
      return t("alerts.detail.overdue", { count: row.alert.daysOverdue ?? 0 });
    case "sterilization_due":
      return t("alerts.detail.sterilizationDue");
    case "inactive":
      return t("alerts.detail.inactive");
    default:
      return "";
  }
}

function StateLine({ row, t }: Readonly<{ row: AlertViewRow; t: TFn }>) {
  if (row.state === "handling" && row.ack) {
    const name = row.ack.acknowledgedByDisplayName ?? row.ack.acknowledgedByEmail ?? "";
    const when = formatDateTime(row.ack.acknowledgedAt);
    return (
      <Text className="mt-2 font-rubik text-[12px] text-muted" numberOfLines={1}>
        {t("alerts.handling")}
        {name ? ` · ${isolate(name)}` : ""}
        {when ? ` · ${when}` : ""}
      </Text>
    );
  }
  if (row.state === "resolved" && row.ack) {
    const when = formatDateTime(row.ack.resolvedAt ?? row.ack.acknowledgedAt);
    return (
      <View className="mt-2">
        <Text className="font-rubik text-[12px] text-muted" numberOfLines={1}>
          {t("alerts.resolved")}
          {when ? ` · ${when}` : ""}
        </Text>
        <Text className="mt-[2px] font-rubik text-[11px] text-text-tertiary" numberOfLines={2}>
          {t("alerts.reopenHint")}
        </Text>
      </View>
    );
  }
  return null;
}

function Actions({
  row,
  t,
  isPending,
  onAcknowledge,
  onResolve,
}: Readonly<{
  row: AlertViewRow;
  t: TFn;
  isPending: boolean;
  onAcknowledge: (row: AlertViewRow) => void;
  onResolve: (row: AlertViewRow) => void;
}>) {
  // "handling" → resolve; "unclaimed"/"resolved" → (re-)acknowledge.
  const isResolveAction = row.state === "handling";
  const label = isResolveAction ? t("alerts.resolve") : t("alerts.acknowledge");
  const onPress = () => {
    if (isPending) return;
    haptics.tap();
    if (isResolveAction) onResolve(row);
    else onAcknowledge(row);
  };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isPending }}
      disabled={isPending}
      className="mt-2.5 min-h-[44px] items-center justify-center rounded-md border border-border bg-surface-raised px-4 py-2.5"
      onPress={onPress}
    >
      <Text
        className={`font-rubik-semibold text-[14px] ${isPending ? "text-muted" : "text-foreground"}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export type AlertRowProps = Readonly<{
  row: AlertViewRow;
  canManage: boolean;
  isPending: boolean;
  onNavigate: (equipmentId: string) => void;
  onAcknowledge: (row: AlertViewRow) => void;
  onResolve: (row: AlertViewRow) => void;
}>;

export const AlertRow = memo(function AlertRow({
  row,
  canManage,
  isPending,
  onNavigate,
  onAcknowledge,
  onResolve,
}: AlertRowProps) {
  // `t` from a hook keeps the row reactive to locale; parent memoizes callbacks.
  const { t } = useTranslation();
  const { alert } = row;

  return (
    <View className="mb-2.5 rounded-md border border-border bg-surface px-4 py-3">
      {/* Press-scale is the sanctioned transform-only row feedback (motion.ts) —
          NOT content/danger animation: the row surface is neutral `bg-surface`;
          the danger family lives only in the static severity Chip below. */}
      <PressableScale
        accessibilityRole="button"
        onPress={() => {
          haptics.tap();
          onNavigate(alert.equipmentId);
        }}
      >
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 font-rubik-semibold text-[16px] text-foreground"
            numberOfLines={1}
            style={{ writingDirection: "ltr" }}
          >
            {alert.equipmentName}
          </Text>
          <Chip label={t(TYPE_LABEL_KEY[alert.type])} tone={alertTone(alert.type)} />
        </View>
        <Text className="mt-[3px] font-rubik text-[13px] text-text-tertiary" numberOfLines={2}>
          {detailText(row, t)}
        </Text>
      </PressableScale>

      <StateLine row={row} t={t} />

      {canManage ? (
        <Actions
          row={row}
          t={t}
          isPending={isPending}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />
      ) : null}
    </View>
  );
});
