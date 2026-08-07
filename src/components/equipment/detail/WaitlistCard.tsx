/**
 * Waitlist section — snapshot + join/leave (student+ floor; the whole screen
 * is already student-gated by BootstrapGate). Not optimistic: position is
 * server-assigned, the mutations apply the returned snapshot (see
 * `useEquipmentWaitlist`). Failures render a loud translated line.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { useEquipmentWaitlist } from "@/hooks/useEquipmentWaitlist";
import { formatDateTime } from "@/lib/datetime";

import { QuietButton, SectionTitle } from "./DetailBits";
import { deriveWaitlist } from "./equipment-detail-derive";

export function WaitlistCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const { t } = useTranslation();
  const { query, join, leave } = useEquipmentWaitlist(equipmentId);

  const pending = join.isPending || leave.isPending;
  const actionFailed = join.isError || leave.isError;

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.waitlist.title")} />
      {query.isPending ? (
        <RowSkeleton />
      ) : query.isError ? (
        <ErrorNote
          message={t("equipmentDetail.waitlist.loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        (() => {
          const view = deriveWaitlist(query.data);
          const reservedUntil = formatDateTime(view.reservedUntilMs);
          return (
            <View className="gap-2.5">
              <Text className="font-rubik text-[13px] text-muted">
                {view.queueSize === 0
                  ? t("equipmentDetail.waitlist.empty")
                  : t("equipmentDetail.waitlist.queueSize", { count: view.queueSize })}
              </Text>
              {view.joined && view.position != null ? (
                <Text className="font-rubik-medium text-[14px] text-foreground">
                  {t("equipmentDetail.waitlist.position", { position: view.position })}
                </Text>
              ) : null}
              {reservedUntil ? (
                <Text className="font-rubik-medium text-[14px] text-info">
                  {t("equipmentDetail.waitlist.reserved", { when: reservedUntil })}
                </Text>
              ) : null}
              <QuietButton
                label={
                  view.joined
                    ? t("equipmentDetail.waitlist.leave")
                    : t("equipmentDetail.waitlist.join")
                }
                disabled={pending}
                onPress={() => {
                  if (view.joined) leave.mutate();
                  else join.mutate();
                }}
              />
              {actionFailed ? (
                <Text className="font-rubik-semibold text-[13px] text-danger light:text-[#B91C1C]">
                  {t("equipmentDetail.waitlist.actionError")}
                </Text>
              ) : null}
            </View>
          );
        })()
      )}
    </SectionCard>
  );
}
