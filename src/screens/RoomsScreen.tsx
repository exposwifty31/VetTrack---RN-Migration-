/**
 * Rooms — G3 Slice 7: the room list with per-room equipment counts and the
 * last-swept meta line; a row press opens RoomDetail (sweep + activity).
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the `EQUIPMENT_`
 *     broadcast prefix (custody/dock moves re-bucket a room's counts) + the
 *     room/docking `audit_log` actionTypes (sweep/verify/anchor). No polling,
 *     no refetchInterval; keepalive never invalidates.
 *   - Reads are `requireAuth` (no role floor) — an off-shift student can list
 *     rooms, so there is no off-shift empty-state here.
 *   - Rows are opaque; the only motion is PressableScale press feedback.
 *   - Zero blur layers.
 *
 * Identity is resolved by the route's BootstrapGate (GatedRooms) before mount.
 */
import { useCallback } from "react";
import { Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import { RoomListRow } from "@/components/rooms/RoomListRow";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { retryUnlessClientError } from "@/lib/api/coded-error";
import {
  ROOM_AUDIT_ACTION_TYPES,
  ROOM_EVENT_TYPE_PREFIXES,
  roomKeys,
  roomsApi,
  type Room,
} from "@/lib/api/rooms";

import type { RootStackScreenProps } from "../navigation/types";

export function RoomsScreen({ navigation }: RootStackScreenProps<"Rooms">) {
  const { t } = useTranslation();

  useRealtimeInvalidation({
    typePrefixes: ROOM_EVENT_TYPE_PREFIXES,
    auditActionTypes: ROOM_AUDIT_ACTION_TYPES,
    queryKeys: [roomKeys.all],
  });

  const listQuery = useQuery<Room[], Error>({
    queryKey: roomKeys.list(),
    queryFn: () => roomsApi.list(),
    retry: retryUnlessClientError,
  });

  // A stable, render-pure "now": dataUpdatedAt (ms) is only read once the list
  // has data (the FlashList branch below), so it is always a valid instant.
  const nowMs = listQuery.dataUpdatedAt;

  const onRowPress = useCallback(
    (roomId: string) => {
      navigation.navigate("RoomDetail", { roomId });
    },
    [navigation],
  );

  const renderItem = useCallback<ListRenderItem<Room>>(
    ({ item }) => <RoomListRow room={item} nowMs={nowMs} onPress={onRowPress} />,
    [nowMs, onRowPress],
  );

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        <Text className="mb-3 font-rubik-bold text-[20px] text-foreground">
          {t("rooms.title")}
        </Text>

        {listQuery.isPending ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : listQuery.isError ? (
          <ErrorNote message={t("common.errorGeneric")} onRetry={() => void listQuery.refetch()} />
        ) : !listQuery.data || listQuery.data.length === 0 ? (
          <View className="flex-1 justify-center">
            <ListEmptyState title={t("rooms.empty")} body={t("rooms.emptyBody")} />
          </View>
        ) : (
          <FlashList
            data={listQuery.data}
            renderItem={renderItem}
            keyExtractor={(room) => room.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </View>
  );
}
