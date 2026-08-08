/**
 * A room card in the Rooms list — opaque surface (never glass), press-scale
 * feedback only (no content/layout animation). Shows the room name, a total
 * count, secondary stat pills, and the last-swept meta line.
 */
import { memo, useCallback } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { Room } from "@/lib/api/rooms";

import { StatPill, SweptMeta } from "./RoomBits";

export type RoomPressHandler = (roomId: string) => void;

function RoomListRowImpl({
  room,
  nowMs,
  onPress,
}: Readonly<{ room: Room; nowMs: number; onPress: RoomPressHandler }>) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(room.id), [onPress, room.id]);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={room.name}
      className="mb-2.5 rounded-md border border-border bg-surface px-4 py-3"
      onPress={handlePress}
    >
      {/* Room + floor names are arbitrary clinic content (often Hebrew) — they
          flow with the layout direction; no forced writingDirection. */}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 font-rubik-bold text-[16px] text-foreground" numberOfLines={2}>
          {room.name}
        </Text>
        {room.floor ? (
          <Text className="font-rubik text-[12px] text-muted" numberOfLines={1}>
            {room.floor}
          </Text>
        ) : null}
      </View>

      <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <StatPill count={room.totalEquipment} label={t("rooms.totalLabel")} />
        <StatPill count={room.availableCount} label={t("rooms.availableLabel")} />
        <StatPill count={room.inUseCount} label={t("rooms.inUseLabel")} />
        {room.issueCount > 0 ? (
          <StatPill count={room.issueCount} label={t("rooms.issuesLabel")} />
        ) : null}
      </View>

      <View className="mt-1.5">
        <SweptMeta
          lastSweptAt={room.lastSweptAt}
          lastSweptByName={room.lastSweptByName}
          nowMs={nowMs}
        />
      </View>
    </PressableScale>
  );
}

export const RoomListRow = memo(RoomListRowImpl);
