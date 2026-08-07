/**
 * Static skeleton row matching the EquipmentRow footprint (56pt, radius-md,
 * opaque surface). Deliberately NO shimmer/pulse — Aurora doctrine: content
 * and layout never animate; loading states are honest static placeholders.
 */
import { View } from "react-native";

export function RowSkeleton() {
  return (
    <View className="mb-2.5 min-h-[56px] justify-center rounded-md border border-border bg-surface px-4 py-3">
      <View className="h-[14px] w-3/5 rounded-full bg-border" />
      <View className="mt-2 h-[10px] w-2/5 rounded-full bg-border" />
    </View>
  );
}
