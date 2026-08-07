/**
 * G2.5 Aurora home — operational dashboard (README.md, "בית מתוקן · חלופה A"),
 * uplifted to G3 Slice 5 daily-pulse parity. Vertical order: glass top bar
 * (floating, content scrolls under it) → greeting → scan hero → shift hero
 * (pulse + adjustments) → tasks/nudges chips → readiness → attention →
 * exceptions → recent activity. Dark default + light parity; RTL-first with
 * LTR isolates for names/numbers.
 *
 * Data honesty: readiness metrics still derive client-side from
 * `api.equipment.list()` (`src/lib/home-readiness.ts`, untouched); the pulse
 * comes from GET /api/home/dashboard + /api/activity + /api/tasks/dashboard +
 * /api/nudges. No polling anywhere — equipment freshness stays on
 * `useEquipmentRealtimeSync` (frozen mount), and the pulse invalidates via
 * `useRealtimeInvalidation` on the verified audit actionTypes
 * (`homePulseInvalidationSpec`); KEEPALIVE never invalidates.
 *
 * Blur budget: GlassTopBar (T1) is the screen's ONLY blur layer. The
 * shift-adjustment sheet's T2 glass lives in a transient Modal — present only
 * while the sheet is open (the Tasks-sheet precedent, within the ≤2-tier
 * budget).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIdentity } from "@/app/useIdentity";
import { ActivityFeedCard } from "@/components/home/ActivityFeedCard";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { AttentionCard } from "@/components/home/AttentionCard";
import { ExceptionsCard } from "@/components/home/ExceptionsCard";
import { GlassTopBar, TOP_BAR_HEIGHT } from "@/components/home/GlassTopBar";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { HomeChipsRow } from "@/components/home/HomeChipsRow";
import {
  clockTimeFromIso,
  deriveShiftHeroState,
  flattenActivityPages,
  homePulseInvalidationSpec,
} from "@/components/home/home-pulse-derive";
import { ReadinessCard } from "@/components/home/ReadinessCard";
import { ScanHero } from "@/components/home/ScanHero";
import { ShiftAdjustmentSheet } from "@/components/home/ShiftAdjustmentSheet";
import { ShiftHeroCard } from "@/components/home/ShiftHeroCard";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys } from "@/lib/api";
import { retryUnlessClientError } from "@/lib/api/coded-error";
import { homeApi, homeKeys, type ActivityPage } from "@/lib/api/home";
import { nudgeKeys, nudgesApi } from "@/lib/api/nudges";
import {
  shiftAdjustmentKeys,
  shiftAdjustmentsApi,
  type ShiftAdjustmentKind,
} from "@/lib/api/shift-adjustments";
import {
  retryUnlessClientError as retryTasksUnlessClientError,
  taskKeys,
  tasksApi,
} from "@/lib/api/tasks";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
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
  const queryClient = useQueryClient();
  useEquipmentRealtimeSync();
  useRealtimeInvalidation(homePulseInvalidationSpec());

  useEffect(() => {
    if (!markedHomeInteractive) {
      // Latch ONLY on a successful mark — a swallowed performance.mark failure
      // must leave the latch open so a later mount can still record O4's end mark.
      markedHomeInteractive = mark(MARK.screenInteractive);
    }
  }, []);

  const fleetQuery = useQuery<EquipmentListPage>({
    queryKey: equipmentKeys.list({ limit: FLEET_PAGE_LIMIT }),
    queryFn: async () => {
      const res = await api.equipment.list({ limit: FLEET_PAGE_LIMIT });
      // Throw on non-200 so React Query records the failure and the cards can
      // render the honest load-error line instead of an endless loading state.
      if (res.status !== 200) {
        throw new Error(`equipment.list failed with status ${res.status}`);
      }
      return res.data;
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

  // ---- G3 Slice 5: daily pulse ------------------------------------------

  const dashboardQuery = useQuery({
    queryKey: homeKeys.dashboard(),
    queryFn: homeApi.getDashboard,
    retry: retryUnlessClientError,
  });

  const activityQuery = useInfiniteQuery({
    queryKey: homeKeys.activity(),
    queryFn: ({ pageParam }) => homeApi.listActivity(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ActivityPage) => last.nextCursor,
    retry: retryUnlessClientError,
  });

  const tasksDashboardQuery = useQuery({
    queryKey: taskKeys.dashboard(),
    queryFn: tasksApi.getTasksDashboard,
    // Off-shift callers resolve below the technician floor (403) — no retry,
    // and the chip simply stays hidden (the hero already reads off-shift).
    retry: retryTasksUnlessClientError,
  });

  const nudgesQuery = useQuery({
    queryKey: nudgeKeys.list(),
    queryFn: nudgesApi.list,
    retry: retryUnlessClientError,
  });

  const adjustmentsQuery = useQuery({
    queryKey: shiftAdjustmentKeys.list("pending"),
    queryFn: () => shiftAdjustmentsApi.list("pending"),
    retry: retryUnlessClientError,
  });

  const invalidateAdjustments = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: shiftAdjustmentKeys.all });
    void queryClient.invalidateQueries({ queryKey: homeKeys.all });
  }, [queryClient]);

  const cancelAdjustment = useMutation({
    mutationFn: shiftAdjustmentsApi.cancel,
    onSettled: invalidateAdjustments,
  });

  const meUserId = identity.data?.id ?? null;
  // Admin callers receive the whole clinic's pending rows — the hero shows
  // only the caller's OWN request.
  const pendingAdjustment = useMemo(() => {
    const rows = adjustmentsQuery.data;
    if (!rows || !meUserId) return null;
    return rows.find((row) => row.requesterUserId === meUserId) ?? null;
  }, [adjustmentsQuery.data, meUserId]);

  const dashboard = dashboardQuery.data;
  const heroState = deriveShiftHeroState(dashboard);
  const [sheetKind, setSheetKind] = useState<ShiftAdjustmentKind | null>(null);
  const closeSheet = useCallback(() => setSheetKind(null), []);

  const activityItems = activityQuery.data
    ? flattenActivityPages(activityQuery.data.pages)
    : null;

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
        <ShiftHeroCard
          state={heroState}
          streak={dashboard?.streak ?? null}
          scansToday={dashboard?.scansToday ?? null}
          tasksDone={dashboard?.tasksCompletedToday ?? null}
          pendingAdjustment={pendingAdjustment}
          cancelInFlight={cancelAdjustment.isPending}
          loadFailed={dashboardQuery.isError}
          onRetry={() => void dashboardQuery.refetch()}
          onRequestAdjustment={setSheetKind}
          onCancelAdjustment={(id) => cancelAdjustment.mutate(id)}
        />
        <HomeChipsRow
          tasksCounts={tasksDashboardQuery.data?.counts ?? null}
          nudgesCount={nudgesQuery.data?.length ?? null}
          onTasksPress={() => navigation.navigate("Tasks")}
        />
        <ReadinessCard readiness={readiness} />
        <AttentionCard
          items={attentionItems}
          loadFailed={fleetQuery.isError}
          onHeaderPress={() => navigation.navigate("Alerts")}
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
        <ActivityFeedCard
          items={activityItems}
          loadFailed={activityQuery.isError}
          hasMore={activityQuery.hasNextPage}
          loadingMore={activityQuery.isFetchingNextPage}
          onLoadMore={() => void activityQuery.fetchNextPage()}
          onRetry={() => void activityQuery.refetch()}
          onItemPress={(item) =>
            navigation.navigate("EquipmentDetail", { equipmentId: item.equipmentId })
          }
        />
      </ScrollView>
      <GlassTopBar
        topInset={insets.top}
        initial={initial}
        // G2.5 data seam: no notifications API yet — badge stays hidden.
        unreadCount={undefined}
        onSearchPress={() => navigation.navigate("EquipmentList")}
        onSettingsPress={() => navigation.navigate("Menu")}
        onChatPress={() => navigation.navigate("ShiftChat")}
      />
      <ShiftAdjustmentSheet
        kind={sheetKind}
        shiftStart={clockTimeFromIso(dashboard?.shift?.startedAt)}
        shiftEnd={clockTimeFromIso(dashboard?.shift?.endsAt)}
        onClose={closeSheet}
      />
    </View>
  );
}
