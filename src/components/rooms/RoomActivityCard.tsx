/**
 * Room activity — the last 5 scan-log entries for equipment currently in the
 * room (GET /api/rooms/:id/activity). Read-only, opaque, zero blur. Freshness
 * rides the parent screen's SSE invalidation; this card only reads its key.
 */
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ltrIsolate, SectionTitle } from "@/components/equipment/detail/DetailBits";
import { statusTone } from "@/components/equipment/detail/equipment-detail-derive";
import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { roomKeys, roomsApi, type RoomActivityEntry } from "@/lib/api/rooms";
import { formatDateTime } from "@/lib/datetime";

function ActivityRow({ entry }: Readonly<{ entry: RoomActivityEntry }>) {
  const when = formatDateTime(entry.timestamp);
  // userName is admin-only (server-stripped otherwise); email is guaranteed
  // Latin → force LTR isolate.
  const who = entry.userName
    ? entry.userName
    : entry.userEmail
      ? ltrIsolate(entry.userEmail)
      : null;

  return (
    <View className="gap-1 border-t border-border py-2.5">
      <View className="flex-row items-center justify-between gap-3">
        {/* Equipment name is arbitrary clinic content → flows with layout. */}
        <Text className="flex-1 font-rubik-semibold text-[14px] text-foreground" numberOfLines={1}>
          {entry.equipmentName}
        </Text>
        {when ? (
          <Text className="font-rubik text-[12px] text-text-tertiary">{when}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between gap-3">
        {entry.status ? (
          <Chip label={entry.status} tone={statusTone(entry.status)} />
        ) : (
          <View />
        )}
        {who ? (
          <Text
            className="font-rubik text-[12px] text-muted"
            style={{ writingDirection: entry.userName ? undefined : "ltr" }}
            numberOfLines={1}
          >
            {who}
          </Text>
        ) : null}
      </View>
      {entry.note ? (
        <Text className="font-rubik text-[13px] text-foreground" numberOfLines={2}>
          {entry.note}
        </Text>
      ) : null}
    </View>
  );
}

export function RoomActivityCard({ roomId }: Readonly<{ roomId: string }>) {
  const { t } = useTranslation();
  const activityQuery = useQuery<RoomActivityEntry[]>({
    queryKey: roomKeys.activity(roomId),
    queryFn: () => roomsApi.activity(roomId),
  });

  return (
    <SectionCard>
      <SectionTitle title={t("roomDetail.activity.title")} />
      {activityQuery.isPending ? (
        <RowSkeleton />
      ) : activityQuery.isError ? (
        <ErrorNote
          message={t("roomDetail.activity.loadError")}
          onRetry={() => void activityQuery.refetch()}
        />
      ) : activityQuery.data && activityQuery.data.length > 0 ? (
        <View>
          {activityQuery.data.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </View>
      ) : (
        <ListEmptyState title={t("roomDetail.activity.empty")} />
      )}
    </SectionCard>
  );
}
