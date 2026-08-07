/**
 * Report-issue section — POST /:id/scan { status: "issue", note }. The server
 * 400s ISSUE_NOTE_REQUIRED on an empty note, so submit is gated on non-empty
 * text client-side. Success invalidates the whole equipment domain (the status
 * flip shows on list + detail + history). Online-only, loud on failure.
 *
 * Aurora: the trigger/submit stay neutral surfaces (press-scale sanctioned);
 * only the resulting status chip elsewhere carries the danger fill — the
 * danger family itself is never animated.
 */
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { SectionCard } from "@/components/ui/SectionCard";
import { api, equipmentKeys } from "@/lib/api";

import { PrimaryButton, QuietButton, SectionTitle } from "./DetailBits";

export function ReportIssueCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const report = useMutation({
    mutationFn: (trimmedNote: string) =>
      api.equipment.reportStatus(equipmentId, { status: "issue", note: trimmedNote }),
    onSuccess: () => {
      setNote("");
      setOpen(false);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });

  const trimmed = note.trim();

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.report.title")} />
      {open ? (
        <View className="gap-2.5">
          <TextInput
            className="min-h-[88px] rounded-[16px] border border-border bg-surface-raised px-4 py-3 font-rubik text-[14px] text-foreground"
            placeholder={t("equipmentDetail.report.notePlaceholder")}
            placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            accessibilityLabel={t("equipmentDetail.report.notePlaceholder")}
          />
          <PrimaryButton
            label={t("equipmentDetail.report.submit")}
            disabled={trimmed.length === 0 || report.isPending}
            onPress={() => report.mutate(trimmed)}
          />
        </View>
      ) : (
        <QuietButton
          label={t("equipmentDetail.actions.reportIssue")}
          onPress={() => setOpen(true)}
        />
      )}
      {report.isSuccess ? (
        <Text className="mt-2.5 font-rubik-semibold text-[13px] text-success light:text-[#166534]">
          {t("equipmentDetail.report.success")}
        </Text>
      ) : null}
      {report.isError ? (
        <Text className="mt-2.5 font-rubik-semibold text-[13px] text-danger light:text-[#B91C1C]">
          {t("equipmentDetail.report.error")}
        </Text>
      ) : null}
    </SectionCard>
  );
}
