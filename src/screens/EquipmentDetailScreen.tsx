/**
 * Equipment detail route — Slice 2's A-grade surface (identity/status header,
 * custody card + actions, location, deployability, truth, waitlist,
 * report-issue, paginated history, transfers).
 *
 * Slice 13 moved the body into `EquipmentDetailContent` so the tablet two-pane
 * layout can host the identical surface in its detail pane. This screen stays
 * the phone route: background + Aurora + the ScanConfirm navigation port.
 *
 * Custody actions NAVIGATE to ScanConfirm with prefill — the proven
 * `useScanToggle` optimistic path and its G2 instrumentation stay untouched.
 * Identity is resolved by the route's BootstrapGate before this mounts.
 */
import { useCallback } from "react";
import { View } from "react-native";

import {
  EquipmentDetailContent,
  type OpenScanConfirm,
} from "@/components/equipment/detail/EquipmentDetailContent";
import { AuroraBackground } from "@/components/home/AuroraBackground";

import type { RootStackScreenProps } from "../navigation/types";

export function EquipmentDetailScreen({
  route,
  navigation,
}: RootStackScreenProps<"EquipmentDetail">) {
  const { equipmentId } = route.params;

  const onOpenScanConfirm = useCallback<OpenScanConfirm>(
    (params) => navigation.navigate("ScanConfirm", params),
    [navigation],
  );

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <EquipmentDetailContent equipmentId={equipmentId} onOpenScanConfirm={onOpenScanConfirm} />
    </View>
  );
}
