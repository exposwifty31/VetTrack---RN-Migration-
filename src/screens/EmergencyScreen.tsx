/**
 * חירום tab — G4-1 read-only Code Blue viewer (was an honest "בקרוב"
 * placeholder; Slice G4-1 fills it in). Emergency doctrine still applies:
 * danger-styled, ZERO glass/translucency, ZERO animation — `CodeBlueViewer`
 * carries the same constraints. This screen is READ-ONLY: no start/end/log
 * affordance lives here yet, so it still makes no pretense of full emergency
 * capability, just of visibility into what is already happening.
 *
 * Self-gated via BootstrapGate (the `MyEquipmentScreen`/`EquipmentListScreen`
 * precedent) — identity must resolve before the active-session fetch fires.
 */
import { BootstrapGate } from "@/app/BootstrapGate";
import { CodeBlueViewer } from "@/features/code-blue/CodeBlueViewer";

export function EmergencyScreen() {
  return (
    <BootstrapGate>
      <CodeBlueViewer />
    </BootstrapGate>
  );
}
