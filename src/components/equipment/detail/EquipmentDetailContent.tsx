/**
 * Equipment detail BODY — extracted from `EquipmentDetailScreen` (Slice 13) so
 * the exact same surface can render either as its own route (phone) or inside
 * the tablet two-pane detail pane, with no behavioural fork.
 *
 * It owns its own scroll and deliberately does NOT render `AuroraBackground` or
 * the screen background: the host (route screen or tablet frame) already does,
 * and a second Aurora layer would double-paint the gradient.
 *
 * Navigation is inverted to a callback (`onOpenScanConfirm`) instead of taking a
 * `navigation` object: the tablet host's navigation prop is typed for ITS route,
 * so a port keeps this component route-agnostic (rn-architecture: screens
 * compose, components stay pure).
 *
 * Aurora budget: ZERO blur layers — every section is an opaque SectionCard;
 * status colors are static semantic tokens (danger never animated). Freshness is
 * `useEquipmentRealtimeSync` (SSE subscribe-only) — no polling, no refetchInterval.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { RootStackParamList } from "@/navigation/types";
import type { EquipmentDetail } from "@/types/api";

import { CustodyCard, type CustodyFeedback } from "./CustodyCard";
import { KeyValueRow } from "./DetailBits";
import { deriveCustody, statusTone } from "./equipment-detail-derive";
import { HistoryCard, statusLabel } from "./HistoryCard";
import { LocationCard } from "./LocationCard";
import { ReadinessCard } from "./ReadinessCard";
import { ReportIssueCard } from "./ReportIssueCard";
import { TransfersCard } from "./TransfersCard";
import { TruthCard } from "./TruthCard";
import { WaitlistCard } from "./WaitlistCard";

/** Port for the custody hand-off to the ScanConfirm route (host-owned). */
export type OpenScanConfirm = (params: RootStackParamList["ScanConfirm"]) => void;

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

export function EquipmentDetailContent({
  equipmentId,
  onOpenScanConfirm,
}: Readonly<{ equipmentId: string; onOpenScanConfirm: OpenScanConfirm }>) {
  const { t } = useTranslation();
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

  const detail = detailQuery.data;

  const goScanConfirm = useCallback(() => {
    if (!detail) return;
    onOpenScanConfirm({
      equipmentId: detail.id,
      prefill: { name: detail.name, status: detail.status },
    });
  }, [onOpenScanConfirm, detail]);

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
  );
}
