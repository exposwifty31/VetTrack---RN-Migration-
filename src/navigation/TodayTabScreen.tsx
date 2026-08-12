/**
 * The Today tab was the ONLY data screen mounting UNGATED, so on a cold start its
 * card queries fired before `users/me` populated `currentUserId` (per-card error
 * wall, physical-device finding 2026-08-12), and an identity 401/403 (stale
 * session) surfaced as unrecoverable generic card errors. Gating it makes Home
 * follow the same contract as every sibling screen: cards mount only once
 * identity is ready, and identity failures land on the gate's reauth screen.
 *
 * Lives in its own module (not MainTabs) so the gate test imports it without
 * dragging the whole bottom-tabs navigator into the jest module graph.
 */
import { BootstrapGate } from "@/app/BootstrapGate";
import { HomeScreen } from "@/screens/HomeScreen";

import type { MainTabScreenProps } from "./types";

// Partial + cast: the tab navigator always supplies the full screen props; the
// Partial signature exists so the gate test can mount the wrapper bare.
export function TodayTabScreen(props: Partial<MainTabScreenProps<"Today">> = {}) {
  return (
    <BootstrapGate>
      <HomeScreen {...(props as MainTabScreenProps<"Today">)} />
    </BootstrapGate>
  );
}
