/**
 * Room detail — G3 Slice 7: room header (counts + last-swept), the sweep flow
 * (worklist → confirm-present checklist → commit; per-item not-found-here;
 * technician+ bulk-verify), and the last-5 activity feed.
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the `EQUIPMENT_`
 *     prefix + room/docking `audit_log` actionTypes → rooms + docking keys. No
 *     polling; keepalive never invalidates.
 *   - Bulk-verify is technician+ — pre-gated with `hasRoleAtLeast` AND the API
 *     surfaces a graceful 403 INSUFFICIENT_ROLE (off-shift) note. The sweep
 *     commit + not-found-here are `requireAuth` (student+), so they stay
 *     ungated.
 *   - Aurora: ZERO blur layers — every section is an opaque SectionCard; the
 *     sweep is inline (no modal, since the nav is frozen). Danger tokens appear
 *     only as static bucket chips. Header counts (current-room-based) and the
 *     sweep worklist length (homed-based) legitimately differ.
 *
 * Identity is resolved by the route's BootstrapGate (GatedRoomDetail).
 */
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { RoomActivityCard } from "@/components/rooms/RoomActivityCard";
import { RoomSweepSection } from "@/components/rooms/RoomSweepSection";
import { StatPill, SweptMeta } from "@/components/rooms/RoomBits";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { retryUnlessClientError } from "@/lib/api/coded-error";
import { dockingKeys } from "@/lib/api/docking";
import {
  ROOM_AUDIT_ACTION_TYPES,
  ROOM_EVENT_TYPE_PREFIXES,
  roomKeys,
  roomsApi,
  type RoomDetail,
} from "@/lib/api/rooms";
import { hasRoleAtLeast } from "@/lib/roles";

import type { RootStackScreenProps } from "../navigation/types";

function HeaderCard({ detail, nowMs }: Readonly<{ detail: RoomDetail; nowMs: number }>) {
  const { t } = useTranslation();
  return (
    <SectionCard>
      {/* Room + floor names are arbitrary clinic content → flow with layout. */}
      <Text className="font-rubik-bold text-[20px] text-foreground" numberOfLines={2}>
        {detail.name}
      </Text>
      {detail.floor ? (
        <Text className="mt-0.5 font-rubik text-[13px] text-muted">{detail.floor}</Text>
      ) : null}
      <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <StatPill count={detail.totalEquipment} label={t("rooms.totalLabel")} />
        <StatPill count={detail.availableCount} label={t("rooms.availableLabel")} />
        <StatPill count={detail.inUseCount} label={t("rooms.inUseLabel")} />
        {detail.issueCount > 0 ? (
          <StatPill count={detail.issueCount} label={t("rooms.issuesLabel")} />
        ) : null}
      </View>
      <View className="mt-1.5">
        <SweptMeta
          lastSweptAt={detail.lastSweptAt}
          lastSweptByName={detail.lastSweptByName}
          nowMs={nowMs}
        />
      </View>
    </SectionCard>
  );
}

export function RoomDetailScreen({ route }: RootStackScreenProps<"RoomDetail">) {
  const { t } = useTranslation();
  const { roomId } = route.params;
  const identity = useIdentity();
  const canBulkVerify = hasRoleAtLeast(identity.data?.effectiveRole, "technician");

  useRealtimeInvalidation({
    typePrefixes: ROOM_EVENT_TYPE_PREFIXES,
    auditActionTypes: ROOM_AUDIT_ACTION_TYPES,
    queryKeys: [roomKeys.all, dockingKeys.all],
  });

  const detailQuery = useQuery<RoomDetail, Error>({
    queryKey: roomKeys.detail(roomId),
    queryFn: () => roomsApi.byId(roomId),
    retry: retryUnlessClientError,
  });

  const detail = detailQuery.data;
  // A stable, render-pure "now": dataUpdatedAt (ms) is only read once `detail`
  // resolved, so it is always a valid instant (never the 0 pre-fetch value).
  const nowMs = detailQuery.dataUpdatedAt;

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
          </View>
        ) : detailQuery.isError ? (
          <ErrorNote
            message={t("roomDetail.loadError")}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : detail ? (
          <>
            <HeaderCard detail={detail} nowMs={nowMs} />
            <RoomSweepSection roomId={roomId} canBulkVerify={canBulkVerify} />
            <RoomActivityCard roomId={roomId} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
