/**
 * Equipment detail — Slice 2's A-grade surface: identity/status header,
 * custody card + actions, location, deployability, truth (evidence graph),
 * waitlist, report-issue, paginated history, transfers.
 *
 * Custody actions NAVIGATE to ScanConfirm with prefill — the proven
 * `useScanToggle` optimistic path and its G2 instrumentation stay untouched.
 * The one direct custody mutation here is return-with-charging (isPluggedIn).
 *
 * Aurora budget: ZERO blur layers on this screen — every section is an opaque
 * SectionCard; status colors are static semantic tokens (danger never
 * animated). Freshness = `useEquipmentRealtimeSync` (SSE subscribe-only; the
 * detail sub-keys nest under ['equipment']) — no polling, no refetchInterval.
 * Identity is resolved by the route's BootstrapGate before this mounts.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { CustodyCard, type CustodyFeedback } from "@/components/equipment/detail/CustodyCard";
import { KeyValueRow } from "@/components/equipment/detail/DetailBits";
import {
  deriveCustody,
  statusTone,
} from "@/components/equipment/detail/equipment-detail-derive";
import { HistoryCard, statusLabel } from "@/components/equipment/detail/HistoryCard";
import { LocationCard } from "@/components/equipment/detail/LocationCard";
import { ReadinessCard } from "@/components/equipment/detail/ReadinessCard";
import { ReportIssueCard } from "@/components/equipment/detail/ReportIssueCard";
import { TransfersCard } from "@/components/equipment/detail/TransfersCard";
import { TruthCard } from "@/components/equipment/detail/TruthCard";
import { WaitlistCard } from "@/components/equipment/detail/WaitlistCard";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { EquipmentDetail } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

function HeaderCard({ detail }: Readonly<{ detail: EquipmentDetail }>) {
  const { t } = useTranslation();
  const verifiedAt = formatDateTime(detail.lastVerifiedAt);
  return (
    <SectionCard>
      {/* Name/model/manufacturer are arbitrary clinic content (often Hebrew) —
          they flow with the layout direction. Only guaranteed-Latin identifiers
          (serial number) force writingDirection ltr (rn-design RTL guidance). */}
      <Text className="font-rubik-bold text-[20px] text-foreground" numberOfLines={2}>
        {detail.name}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        <Chip label={statusLabel(t, detail.status)} tone={statusTone(detail.status)} />
      </View>
      <View className="mt-2">
        {detail.serialNumber ? (
          <KeyValueRow label={t("equipmentDetail.identity.serial")} value={detail.serialNumber} ltr />
        ) : null}
        {detail.model ? (
          <KeyValueRow label={t("equipmentDetail.identity.model")} value={detail.model} />
        ) : null}
        {detail.manufacturer ? (
          <KeyValueRow
            label={t("equipmentDetail.identity.manufacturer")}
            value={detail.manufacturer}
          />
        ) : null}
      </View>
      {verifiedAt ? (
        <Text className="mt-1 font-rubik text-[12px] text-text-tertiary" numberOfLines={1}>
          {detail.lastVerifiedByName
            ? t("equipmentDetail.identity.lastVerified", {
                when: verifiedAt,
                name: detail.lastVerifiedByName,
              })
            : t("equipmentDetail.identity.lastVerifiedNoName", { when: verifiedAt })}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export function EquipmentDetailScreen({
  route,
  navigation,
}: RootStackScreenProps<"EquipmentDetail">) {
  const { t } = useTranslation();
  const { equipmentId } = route.params;
  const queryClient = useQueryClient();
  const identity = useIdentity();
  useEquipmentRealtimeSync();

  const detailQuery = useQuery<EquipmentDetail>({
    queryKey: equipmentKeys.detail(equipmentId),
    queryFn: () => api.equipment.byId(equipmentId),
  });

  // Return-with-charging — the one direct custody mutation on this screen.
  // NOT optimistic: custody flips follow the server row; onSettled invalidates
  // the whole equipment domain (list + detail + sub-resources).
  const directReturn = useMutation({
    mutationFn: (isPluggedIn: boolean) =>
      api.equipment.returnEquipment(equipmentId, { isPluggedIn }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });

  const goScanConfirm = useCallback(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    navigation.navigate("ScanConfirm", {
      equipmentId: detail.id,
      prefill: { name: detail.name, status: detail.status },
    });
  }, [navigation, detailQuery.data]);

  const detail = detailQuery.data;

  // "Now" anchor for the overdue derivation: `dataUpdatedAt` re-anchors it on
  // every fetch (no effect needed — it IS a wall-clock ms), and ONE local
  // re-render is scheduled at the due boundary so an item flips to overdue on
  // screen without waiting for a refetch. Clock-state only — no network, no
  // interval; the zero-polling doctrine holds.
  const [clockMs, setClockMs] = useState(() => Date.now());
  const nowMs = Math.max(clockMs, detailQuery.dataUpdatedAt);

  const custody = detail ? deriveCustody(detail, identity.data?.id, nowMs) : null;

  const dueMs = custody?.kind === "held" ? custody.dueMs : null;
  const isOverdue = custody?.kind === "held" ? custody.overdue : false;
  useEffect(() => {
    if (dueMs == null || isOverdue) return;
    const delay = dueMs - Date.now() + 1;
    // setTimeout overflows past 2^31-1 ms and would fire immediately, looping —
    // a >24-day horizon re-anchors on the next data refresh instead.
    if (delay > 0x7fffffff) return;
    const timer = setTimeout(() => setClockMs(Date.now()), Math.max(delay, 0));
    return () => clearTimeout(timer);
  }, [dueMs, isOverdue]);

  const returnFeedback: CustodyFeedback = directReturn.isSuccess
    ? { tone: "success", message: t("equipmentDetail.return.success") }
    : directReturn.isError
      ? { tone: "error", message: t("equipmentDetail.return.error") }
      : null;

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {detailQuery.isPending ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : detailQuery.isError ? (
          <ErrorNote
            message={t("equipmentDetail.loadError")}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : detail && custody ? (
          <>
            <HeaderCard detail={detail} />
            <CustodyCard
              custody={custody}
              onCheckout={goScanConfirm}
              onReturn={goScanConfirm}
              onDirectReturn={(isPluggedIn) => directReturn.mutate(isPluggedIn)}
              directReturnPending={directReturn.isPending}
              feedback={returnFeedback}
            />
            <LocationCard detail={detail} />
            <ReadinessCard equipmentId={equipmentId} />
            <TruthCard equipmentId={equipmentId} />
            <WaitlistCard equipmentId={equipmentId} />
            <ReportIssueCard equipmentId={equipmentId} />
            <HistoryCard equipmentId={equipmentId} />
            <TransfersCard equipmentId={equipmentId} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
