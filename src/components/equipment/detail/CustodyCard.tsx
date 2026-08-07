/**
 * Custody section — holder / since / expected-return plus the custody actions.
 *
 * Checkout + Return are NAVIGATION affordances to ScanConfirm (the proven
 * `useScanToggle` optimistic path with its G2 instrumentation untouched).
 * "Return + charging" is the one direct-endpoint path (POST /:id/return with
 * `isPluggedIn`) — an INLINE opaque prompt, not a sheet: the detail screen's
 * Aurora budget is zero blur layers. The two return flows are mutually
 * exclusive: while the direct return is in flight, the scan-path Return is
 * disabled too.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/ui/SectionCard";
import { formatDateTime } from "@/lib/datetime";

import { ltrIsolate, PrimaryButton, QuietButton, SectionTitle } from "./DetailBits";
import type { CustodyView } from "./equipment-detail-derive";

export type CustodyFeedback = Readonly<{ tone: "success" | "error"; message: string }> | null;

type HeldView = Extract<CustodyView, { kind: "held" }>;

type TFn = ReturnType<typeof useTranslation>["t"];

function holderLabel(t: TFn, custody: HeldView): string {
  if (custody.byMe) return t("equipmentDetail.custody.heldByMe");
  if (custody.email) {
    return t("equipmentDetail.custody.holder", { email: ltrIsolate(custody.email) });
  }
  return t("equipmentDetail.custody.holderUnknown");
}

function HeldSummary({ custody }: Readonly<{ custody: HeldView }>) {
  const { t } = useTranslation();
  const since = formatDateTime(custody.sinceMs);
  const due = formatDateTime(custody.dueMs);
  return (
    <View className="gap-0.5">
      <Text className="font-rubik-medium text-[14px] text-warning" numberOfLines={1}>
        {holderLabel(t, custody)}
      </Text>
      {since ? (
        <Text className="font-rubik text-[13px] text-text-tertiary">
          {t("equipmentDetail.custody.since", { when: since })}
        </Text>
      ) : null}
      {due ? (
        <Text
          className={`font-rubik text-[13px] ${custody.overdue ? "text-warning" : "text-text-tertiary"}`}
        >
          {custody.overdue
            ? t("equipmentDetail.custody.overdue", { when: due })
            : t("equipmentDetail.custody.expectedReturn", { when: due })}
        </Text>
      ) : null}
    </View>
  );
}

function ChargingPrompt({
  pending,
  onDirectReturn,
}: Readonly<{ pending: boolean; onDirectReturn: (isPluggedIn: boolean) => void }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-2.5 rounded-[20px] border border-border bg-surface-raised p-4">
      <Text className="font-rubik-medium text-[14px] text-foreground">
        {t("equipmentDetail.return.pluggedInPrompt")}
      </Text>
      <QuietButton
        label={t("equipmentDetail.return.pluggedIn")}
        disabled={pending}
        onPress={() => onDirectReturn(true)}
      />
      <QuietButton
        label={t("equipmentDetail.return.notPluggedIn")}
        disabled={pending}
        onPress={() => onDirectReturn(false)}
      />
    </View>
  );
}

function HeldByMeActions({
  onReturn,
  onDirectReturn,
  directReturnPending,
}: Readonly<{
  onReturn: () => void;
  onDirectReturn: (isPluggedIn: boolean) => void;
  directReturnPending: boolean;
}>) {
  const { t } = useTranslation();
  const [chargingPromptOpen, setChargingPromptOpen] = useState(false);
  return (
    <View className="mt-4 gap-2.5">
      {/* Disabled while the direct return is in flight — the two return flows
          must never race each other. */}
      <PrimaryButton
        label={t("equipmentDetail.actions.return")}
        disabled={directReturnPending}
        onPress={onReturn}
      />
      {chargingPromptOpen ? (
        <ChargingPrompt pending={directReturnPending} onDirectReturn={onDirectReturn} />
      ) : (
        <QuietButton
          label={t("equipmentDetail.actions.returnCharging")}
          onPress={() => setChargingPromptOpen(true)}
        />
      )}
    </View>
  );
}

function FeedbackLine({ feedback }: Readonly<{ feedback: CustodyFeedback }>) {
  if (!feedback) return null;
  return (
    <Text
      className={`mt-3 font-rubik-semibold text-[14px] ${
        feedback.tone === "success"
          ? "text-success light:text-[#166534]"
          : "text-danger light:text-[#B91C1C]"
      }`}
    >
      {feedback.message}
    </Text>
  );
}

type CustodyCardProps = Readonly<{
  custody: CustodyView;
  onCheckout: () => void;
  onReturn: () => void;
  onDirectReturn: (isPluggedIn: boolean) => void;
  directReturnPending: boolean;
  feedback: CustodyFeedback;
}>;

export function CustodyCard({
  custody,
  onCheckout,
  onReturn,
  onDirectReturn,
  directReturnPending,
  feedback,
}: CustodyCardProps) {
  const { t } = useTranslation();
  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.custody.title")} />

      {custody.kind === "available" ? (
        <Text className="font-rubik text-[14px] text-success">
          {t("equipmentDetail.custody.available")}
        </Text>
      ) : (
        <HeldSummary custody={custody} />
      )}

      {custody.kind === "available" ? (
        <View className="mt-4">
          <PrimaryButton label={t("equipmentDetail.actions.checkout")} onPress={onCheckout} />
        </View>
      ) : custody.byMe ? (
        <HeldByMeActions
          onReturn={onReturn}
          onDirectReturn={onDirectReturn}
          directReturnPending={directReturnPending}
        />
      ) : null}

      <FeedbackLine feedback={feedback} />
    </SectionCard>
  );
}
