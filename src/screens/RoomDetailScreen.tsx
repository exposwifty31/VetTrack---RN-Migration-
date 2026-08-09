/**
 * Room detail route — G3 Slice 7: room header (counts + last-swept), the sweep
 * flow (worklist → confirm-present checklist → commit; per-item not-found-here;
 * technician+ bulk-verify), and the last-5 activity feed.
 *
 * Slice 13 moved the body into `RoomDetailContent` so the tablet two-pane layout
 * can host the identical surface in its detail pane. This screen stays the phone
 * route: background + Aurora only.
 *
 * Identity is resolved by the route's BootstrapGate (GatedRoomDetail).
 */
import { View } from "react-native";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import { RoomDetailContent } from "@/components/rooms/RoomDetailContent";

import type { RootStackScreenProps } from "../navigation/types";

export function RoomDetailScreen({ route }: RootStackScreenProps<"RoomDetail">) {
  const { roomId } = route.params;

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <RoomDetailContent roomId={roomId} />
    </View>
  );
}
