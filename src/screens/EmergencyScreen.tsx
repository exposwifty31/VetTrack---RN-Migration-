/**
 * חירום tab — G4-1 read-only Code Blue viewer + G4-5 mutation action bar.
 * Emergency doctrine still applies: danger-styled, ZERO glass/translucency,
 * ZERO animation — both children carry the same constraints.
 *
 * `CodeBlueActions` (G4-5) owns every write affordance (start/log/end/
 * presence) and renders ABOVE the frozen `CodeBlueViewer` (G4-1), which stays
 * exactly as merged — read-only, no mutation affordance inside it. The two
 * share the same `codeBlueKeys.active()` query (react-query dedupes to one
 * network request), so stacking them costs nothing extra.
 *
 * Self-gated via BootstrapGate (the `MyEquipmentScreen`/`EquipmentListScreen`
 * precedent) — identity must resolve before the active-session fetch fires.
 */
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BootstrapGate } from "@/app/BootstrapGate";
import { CodeBlueActions } from "@/features/code-blue/CodeBlueActions";
import { CodeBlueViewer } from "@/features/code-blue/CodeBlueViewer";

export function EmergencyScreen() {
  // Tab mode has no native header, so this screen owns its TOP inset (the
  // MineTabScreen precedent). Without it the vet-only banner painted OVER the
  // status-bar row on notch devices — both platforms (G3 physical pass).
  const insets = useSafeAreaInsets();
  return (
    <BootstrapGate>
      <View
        testID="emergency-screen-root"
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top }}
      >
        <CodeBlueActions />
        <View className="flex-1">
          <CodeBlueViewer />
        </View>
      </View>
    </BootstrapGate>
  );
}
