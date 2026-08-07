/**
 * Custody section — holder / since / expected-return plus the custody actions.
 *
 * Checkout + Return are NAVIGATION affordances to ScanConfirm (the proven
 * `useScanToggle` optimistic path with its G2 instrumentation untouched).
 * "Return + charging" is the one direct-endpoint path (POST /:id/return with
 * `isPluggedIn`) — an INLINE opaque prompt, not a sheet: the detail screen's
 * Aurora budget is zero blur layers.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/ui/SectionCard";
import { formatDateTime } from "@/lib/datetime";

import { ltrIsolate, PrimaryButton, QuietButton, SectionTitle } from "./DetailBits";
import type { CustodyView } from "./equipment-detail-derive";

export type CustodyFeedback = Readonly<{ tone: "success" | "error"; message: string }> | null;

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
  const [chargingPromptOpen, setChargingPromptOpen] = useState(false);

  const held = custody.kind === "held";
  const since = held ? formatDateTime(custody.sinceMs) : null;
  const due = held ? formatDateTime(custody.dueMs) : null;

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.custody.title")} />

      {custody.kind === "available" ? (
        <Text className="font-rubik text-[14px] text-success">
          {t("equipmentDetail.custody.available")}
        </Text>
      ) : (
        <View className="gap-0.5">
          <Text className="font-rubik-medium text-[14px] text-warning" numberOfLines={1}>
            {custody.byMe
              ? t("equipmentDetail.custody.heldByMe")
              : custody.email
                ? t("equipmentDetail.custody.holder", { email: ltrIsolate(custody.email) })
                : t("equipmentDetail.custody.holderUnknown")}
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
      )}

      {custody.kind === "available" ? (
        <View className="mt-4">
          <PrimaryButton label={t("equipmentDetail.actions.checkout")} onPress={onCheckout} />
        </View>
      ) : custody.byMe ? (
        <View className="mt-4 gap-2.5">
          <PrimaryButton label={t("equipmentDetail.actions.return")} onPress={onReturn} />
          {chargingPromptOpen ? (
            <View className="gap-2.5 rounded-[20px] border border-border bg-surface-raised p-4">
              <Text className="font-rubik-medium text-[14px] text-foreground">
                {t("equipmentDetail.return.pluggedInPrompt")}
              </Text>
              <QuietButton
                label={t("equipmentDetail.return.pluggedIn")}
                disabled={directReturnPending}
                onPress={() => onDirectReturn(true)}
              />
              <QuietButton
                label={t("equipmentDetail.return.notPluggedIn")}
                disabled={directReturnPending}
                onPress={() => onDirectReturn(false)}
              />
            </View>
          ) : (
            <QuietButton
              label={t("equipmentDetail.actions.returnCharging")}
              onPress={() => setChargingPromptOpen(true)}
            />
          )}
        </View>
      ) : null}

      {feedback ? (
        <Text
          className={`mt-3 font-rubik-semibold text-[14px] ${
            feedback.tone === "success"
              ? "text-success light:text-[#166534]"
              : "text-danger light:text-[#B91C1C]"
          }`}
        >
          {feedback.message}
        </Text>
      ) : null}
    </SectionCard>
  );
}
