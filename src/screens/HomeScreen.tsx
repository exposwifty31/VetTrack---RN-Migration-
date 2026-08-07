/**
 * G2.5 Aurora home — operational dashboard (README.md, "בית מתוקן · חלופה A").
 * Vertical order: glass top bar (floating, content scrolls under it) → greeting
 * → scan hero → readiness → attention → exceptions. Dark default + light
 * parity; RTL-first with LTR isolates for names/numbers.
 *
 * Data honesty: every metric derives client-side from `api.equipment.list()`
 * (`src/lib/home-readiness.ts`). No polling — freshness comes from the shared
 * SSE port via `useEquipmentRealtimeSync` (subscribe-only invalidation).
 */
import { useEffect, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIdentity } from "@/app/useIdentity";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { AttentionCard } from "@/components/home/AttentionCard";
import { ExceptionsCard } from "@/components/home/ExceptionsCard";
import { GlassTopBar, TOP_BAR_HEIGHT } from "@/components/home/GlassTopBar";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { ReadinessCard } from "@/components/home/ReadinessCard";
import { ScanHero } from "@/components/home/ScanHero";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys } from "@/lib/api";
import {
  deriveAttentionItems,
  deriveExceptions,
  deriveReadiness,
} from "@/lib/home-readiness";
import { mark, MARK } from "@/lib/instrumentation/perf";
import type { EquipmentListPage } from "@/types/api";

import type { MainTabScreenProps } from "../navigation/types";

// O4 v2 (pre-registration §3): cold TTI = nativeLaunchStart → FIRST interactive
// screen, which is Home. Latch once per process so re-visits never re-mark.
let markedHomeInteractive = false;

/**
 * Server max page size. G2.5 data seam: metrics cover the first page only —
 * a clinic with >1000 units needs a server-side summary endpoint before the
 * numbers can claim the whole fleet.
 */
const FLEET_PAGE_LIMIT = 1000;

export function HomeScreen({ navigation }: MainTabScreenProps<"Today">) {
  const insets = useSafeAreaInsets();
  const identity = useIdentity();
  useEquipmentRealtimeSync();

  useEffect(() => {
    if (!markedHomeInteractive) {
      // Latch ONLY on a successful mark — a swallowed performance.mark failure
      // must leave the latch open so a later mount can still record O4's end mark.
      markedHomeInteractive = mark(MARK.screenInteractive);
    }
  }, []);

  const fleetQuery = useQuery<EquipmentListPage | null>({
    queryKey: equipmentKeys.list({ limit: FLEET_PAGE_LIMIT }),
    queryFn: async () => {
      const res = await api.equipment.list({ limit: FLEET_PAGE_LIMIT });
      return res.status === 200 ? res.data : null;
    },
  });

  const items = fleetQuery.data?.items;
  // "Now" = when the data landed (query dataUpdatedAt): pure during render,
  // and list refetches drive re-derivation — no timers/polling age it in place.
  const sampledAtMs = fleetQuery.dataUpdatedAt;

  const readiness = useMemo(() => (items ? deriveReadiness(items) : null), [items]);
  const attentionItems = useMemo(
    () => (items ? deriveAttentionItems(items, sampledAtMs) : null),
    [items, sampledAtMs],
  );
  const exceptions = useMemo(
    () => (items ? deriveExceptions(items, sampledAtMs) : []),
    [items, sampledAtMs],
  );

  const displayName =
    identity.data?.name?.trim().split(/\s+/)[0] ||
    identity.data?.email?.split("@")[0] ||
    undefined;
  const initial = displayName ? displayName[0].toUpperCase() : undefined;

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + TOP_BAR_HEIGHT + 8,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <GreetingHeader name={displayName} />
        <ScanHero onPress={() => navigation.navigate("Scan")} />
        <ReadinessCard readiness={readiness} />
        <AttentionCard
          items={attentionItems}
          loadFailed={fleetQuery.isError}
          onItemPress={(item) =>
            navigation.navigate("EquipmentList", { initialQuery: item.equipmentName })
          }
        />
        {exceptions.length > 0 ? (
          <ExceptionsCard
            count={exceptions.length}
            items={exceptions}
            onHeaderPress={() => navigation.navigate("EquipmentList")}
            onItemPress={(item) =>
              navigation.navigate("EquipmentList", { initialQuery: item.name })
            }
          />
        ) : null}
      </ScrollView>
      <GlassTopBar
        topInset={insets.top}
        initial={initial}
        // G2.5 data seam: no notifications API yet — badge stays hidden.
        unreadCount={undefined}
        onSearchPress={() => navigation.navigate("EquipmentList")}
        onSettingsPress={() => navigation.navigate("Menu")}
      />
    </View>
  );
}
