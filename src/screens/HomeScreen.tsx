/**
 * G2.5 Aurora home — operational dashboard (README.md, "בית מתוקן · חלופה A"),
 * uplifted to G3 Slice 5 daily-pulse parity. The screen scroller is a
 * top-level FlashList (rn-best-practices: the cursor-paged activity feed is
 * unbounded, so its rows are virtualized/recycled — never `map`-mounted in a
 * ScrollView): all fixed dashboard content rides `ListHeaderComponent`, the
 * feed's load-more rides the footer. Vertical order: glass top bar (floating,
 * content scrolls under it) → greeting → scan hero → shift hero (pulse +
 * adjustments) → tasks/nudges chips → readiness → attention → exceptions →
 * recent activity. Dark default + light parity; RTL-first with LTR isolates
 * for names/numbers.
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
 * budget). The quick-search overlay is a transient Modal too, but BLUR-FREE
 * (dim backdrop + opaque surface), so it adds no blur layer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import type { ListRenderItem } from "@shopify/flash-list";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIdentity } from "@/app/useIdentity";
import {
  ActivityLoadMoreFooter,
  ActivityRow,
  ActivitySectionHeader,
} from "@/components/home/ActivityFeed";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { AttentionCard } from "@/components/home/AttentionCard";
import { ExceptionsCard } from "@/components/home/ExceptionsCard";
import { GlassTopBar, TOP_BAR_HEIGHT } from "@/components/home/GlassTopBar";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { QuickSearchOverlay } from "@/components/home/QuickSearchOverlay";
import { resolveHomeColumns } from "@/components/home/home-bento-layout";
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
import { useIsTablet } from "@/lib/use-is-tablet";
import { homeApi, homeKeys, type ActivityItem, type ActivityPage } from "@/lib/api/home";
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

/**
 * Pairs two dashboard cards side by side in Home's two-column tablet reflow,
 * and falls back to the phone's vertical stack at one column.
 *
 * Module scope on purpose (rn-best-practices): declared inside `HomeScreen`
 * this would be a new component type every render, remounting both cards —
 * and the shift hero owns sheet-driven state.
 *
 * No gap/margin here: each card root carries its own `px-[22px]`, so the
 * column gutter is the two cards' facing insets. `flex-row` is already flipped
 * by `I18nManager` under RTL, so `start` is the logical leading column.
 */
function BentoRow({
  columns,
  start,
  end,
}: Readonly<{ columns: 1 | 2; start: ReactNode; end: ReactNode }>) {
  if (columns === 1) {
    return (
      <>
        {start}
        {end}
      </>
    );
  }
  return (
    <View className="flex-row items-stretch">
      <View className="flex-1">{start}</View>
      <View className="flex-1">{end}</View>
    </View>
  );
}

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
  // Quick equipment search opens IN PLACE (a transient overlay), not a navigate.
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  // Stable so the overlay's memoized EquipmentRow onPress chain holds identity.
  const onQuickSearchSelect = useCallback(
    (equipmentId: string) => {
      setSearchOpen(false);
      navigation.navigate("EquipmentDetail", { equipmentId });
    },
    [navigation],
  );

  const activityItems = activityQuery.data
    ? flattenActivityPages(activityQuery.data.pages)
    : null;

  const onActivityPress = useCallback(
    (item: ActivityItem) =>
      navigation.navigate("EquipmentDetail", { equipmentId: item.equipmentId }),
    [navigation],
  );

  // Stable renderItem so FlashList recycling stays cheap (rn-best-practices).
  const renderActivityRow = useCallback<ListRenderItem<ActivityItem>>(
    ({ item }) => <ActivityRow item={item} onPress={onActivityPress} />,
    [onActivityPress],
  );

  const displayName =
    identity.data?.name?.trim().split(/\s+/)[0] ||
    identity.data?.email?.split("@")[0] ||
    undefined;
  const initial = displayName ? displayName[0].toUpperCase() : undefined;

  // Slice 13: Home is the one adapted screen that is not master/detail — on a
  // wide-enough tablet its cards reflow into two columns instead of one very
  // wide stack. The blur budget is untouched: GlassTopBar stays the only blur
  // layer, and the reflow adds no animation.
  const isTablet = useIsTablet();
  const { width: windowWidth } = useWindowDimensions();
  const columns = resolveHomeColumns(windowWidth, isTablet);

  // All fixed dashboard content rides the list header (single scroller: the
  // FlashList below owns scrolling; only activity rows are list items).
  const scanHero = <ScanHero onPress={() => navigation.navigate("Scan")} />;
  const shiftHero = (
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
  );
  const readinessCard = <ReadinessCard readiness={readiness} />;
  const attentionCard = (
    <AttentionCard
      items={attentionItems}
      loadFailed={fleetQuery.isError}
      onHeaderPress={() => navigation.navigate("Alerts")}
      onItemPress={(item) =>
        navigation.navigate("EquipmentList", { initialQuery: item.equipmentName })
      }
    />
  );

  const listHeader = (
    <View>
      <GreetingHeader name={displayName} />
      <BentoRow columns={columns} start={scanHero} end={shiftHero} />
      <HomeChipsRow
        tasksCounts={tasksDashboardQuery.data?.counts ?? null}
        nudgesCount={nudgesQuery.data?.length ?? null}
        onTasksPress={() => navigation.navigate("Tasks")}
      />
      <BentoRow columns={columns} start={readinessCard} end={attentionCard} />
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
      <ActivitySectionHeader
        items={activityItems}
        loadFailed={activityQuery.isError}
        onRetry={() => void activityQuery.refetch()}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1">
        <FlashList
          data={activityItems ?? []}
          renderItem={renderActivityRow}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            <ActivityLoadMoreFooter
              hasMore={activityQuery.hasNextPage}
              loadingMore={activityQuery.isFetchingNextPage}
              onLoadMore={() => void activityQuery.fetchNextPage()}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + TOP_BAR_HEIGHT + 8,
            paddingBottom: 24,
          }}
        />
      </View>
      <GlassTopBar
        topInset={insets.top}
        initial={initial}
        // G2.5 data seam: no notifications API yet — badge stays hidden.
        unreadCount={undefined}
        onSearchPress={() => setSearchOpen(true)}
        onBellPress={() => navigation.navigate("Alerts")}
        onSettingsPress={() => navigation.navigate("Settings")}
        onChatPress={() => navigation.navigate("ShiftChat")}
      />
      <ShiftAdjustmentSheet
        kind={sheetKind}
        shiftStart={clockTimeFromIso(dashboard?.shift?.startedAt)}
        shiftEnd={clockTimeFromIso(dashboard?.shift?.endsAt)}
        onClose={closeSheet}
      />
      <QuickSearchOverlay
        visible={searchOpen}
        onClose={closeSearch}
        onSelect={onQuickSearchSelect}
      />
    </View>
  );
}
