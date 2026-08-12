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

import { BootstrapGate } from "@/app/BootstrapGate";
import { CodeBlueActions } from "@/features/code-blue/CodeBlueActions";
import { CodeBlueViewer } from "@/features/code-blue/CodeBlueViewer";

export function EmergencyScreen() {
  return (
    <BootstrapGate>
      <View className="flex-1 bg-background">
        <CodeBlueActions />
        <View className="flex-1">
          <CodeBlueViewer />
        </View>
      </View>
    </BootstrapGate>
  );
}
