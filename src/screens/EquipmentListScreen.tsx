import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { BootstrapGate } from "@/app/BootstrapGate";
import { PressableScale } from "@/components/PressableScale";
import { EquipmentRow, type RowPressHandler } from "@/components/equipment/EquipmentRow";
import {
  EquipmentDetailContent,
  type OpenScanConfirm,
} from "@/components/equipment/detail/EquipmentDetailContent";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { FORWARD_ARROW } from "@/components/home/glyphs";
import { SearchIcon } from "@/components/home/icons";
import { SelectPlaceholder, TwoPane } from "@/components/tablet/TwoPane";
import { resolveSelectedItem } from "@/components/tablet/two-pane-layout";
import { useDualFrameSampler } from "@/hooks/useDualFrameSampler";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { useEquipmentSearch } from "@/hooks/useEquipmentSearch";
import { mark, MARK } from "@/lib/instrumentation/perf";
import { useIsTablet } from "@/lib/use-is-tablet";

import type { RootStackScreenProps } from "../navigation/types";

function EquipmentListBody({ navigation, route }: RootStackScreenProps<"EquipmentList">) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  useEquipmentRealtimeSync();

  // Search-query state + ETag-threaded fetch — the shared hook, so this screen
  // and the home QuickSearchOverlay never drift. Seed from an initialQuery param
  // (the NFC advisory fallback: a non-canonical tag pre-filters by its payload).
  const { query, setQuery, items, isPending, isError, isSuccess, dataUpdatedAt } =
    useEquipmentSearch(route.params?.initialQuery ?? "");

  // Cold-TTI (O4) end marker: the list is interactive on its FIRST successful
  // render. A ref latches for the screen lifetime so a later search re-entering
  // `isSuccess` cannot overwrite the mark with user-search time (measureTTI picks
  // the latest `screenInteractive`).
  const markedInteractive = useRef(false);
  useEffect(() => {
    if (isSuccess && !markedInteractive.current) {
      // Latch ONLY on a successful mark — a swallowed performance.mark failure
      // must leave the latch open so a later render can still record the mark.
      markedInteractive.current = mark(MARK.screenInteractive);
    }
  }, [isSuccess]);

  // Slice 13: on a tablet the list stays mounted in the master pane and a row
  // press SELECTS (the detail pane renders EquipmentDetail's content). On a
  // phone the Slice-1 behaviour is untouched — the row still pushes ScanConfirm.
  const isTablet = useIsTablet();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const onOpenScanConfirm = useCallback<OpenScanConfirm>(
    (params) => navigation.navigate("ScanConfirm", params),
    [navigation],
  );

  const onRowPress = useCallback<RowPressHandler>(
    (item) => {
      if (isTablet) {
        setSelectedId(item.id);
        return;
      }
      onOpenScanConfirm({
        equipmentId: item.id,
        prefill: { name: item.name, status: item.status },
      });
    },
    [isTablet, onOpenScanConfirm],
  );

  // O1/O2 scroll segment: sample frames (JS rAF + UI useFrameCallback) while the
  // FlashList scrolls. Drag and momentum are separate sampled segments that
  // concatenate in the perf sink — start/stop are idempotent, so the drag→momentum
  // hand-off (end-drag fires before momentum-begin) costs at most one frame gap.
  const { start: startScrollSampling, stop: stopScrollSampling } = useDualFrameSampler();

  // Selection is DERIVED from the live list, never trusted from state alone: a
  // new search (or a realtime update that drops the row) collapses the detail
  // pane back to its placeholder instead of stranding an invisible row.
  const selected = resolveSelectedItem(items, selectedId);

  const masterPane = (
    <View className="flex-1 px-[22px] pt-3">
        {/* Aurora search field — opaque surface, radius-md, muted placeholder, ≥44pt. */}
        <View className="mb-2.5 min-h-[48px] flex-row items-center gap-2.5 rounded-[20px] border border-border bg-surface px-4">
          <SearchIcon color={light ? "#5B5680" : "#A6A0C3"} size={18} />
          <TextInput
            className="flex-1 py-3 font-rubik text-[16px] text-foreground"
            placeholder={t("equipment.searchPlaceholder")}
            placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            accessibilityLabel={t("equipment.searchPlaceholder")}
          />
        </View>

        {/* Scan CTA — compact variant of the home scan hero: same violet gradient
            + inner highlight, single 52pt row (no double bezel at this size). */}
        <PressableScale
          className="mb-3 overflow-hidden rounded-[20px]"
          accessibilityRole="button"
          accessibilityLabel={t("home.scan")}
          onPress={() => navigation.navigate("Scan")}
        >
          <View
            className="min-h-[52px] flex-row items-center gap-3 rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-4 py-2.5"
            style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
          >
            <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.18)]">
              <View className="h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-white">
                <View className="h-[5px] w-[5px] rounded-full bg-white" />
              </View>
            </View>
            {/* AA (4.5:1): solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
            <Text className="flex-1 font-rubik-bold text-[15px] text-white">{t("home.scan")}</Text>
            <View className="h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.16)]">
              <Text className="text-[15px] text-white">{FORWARD_ARROW}</Text>
            </View>
          </View>
        </PressableScale>

        {isPending ? (
          <View className="flex-1 items-center justify-center gap-2.5">
            <ActivityIndicator color={light ? "#6D28D9" : "#A78BFA"} />
            <Text className="font-rubik text-[13px] text-muted">{t("common.loading")}</Text>
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center font-rubik text-[15px] text-danger">
              {t("equipment.loadError")}
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center font-rubik text-[15px] text-muted">
              {t("equipment.empty")}
            </Text>
          </View>
        ) : (
          <FlashList
            data={items}
            renderItem={({ item }) => (
              <EquipmentRow item={item} onPress={onRowPress} sampledAtMs={dataUpdatedAt} />
            )}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.status}
            onScrollBeginDrag={startScrollSampling}
            onScrollEndDrag={stopScrollSampling}
            onMomentumScrollBegin={startScrollSampling}
            onMomentumScrollEnd={stopScrollSampling}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      {isTablet ? (
        <TwoPane
          master={masterPane}
          detail={
            selected ? (
              <EquipmentDetailContent
                // Remount on selection change so the detail pane's local clock
                // state never leaks between two different units.
                key={selected.id}
                equipmentId={selected.id}
                onOpenScanConfirm={onOpenScanConfirm}
              />
            ) : null
          }
          placeholder={
            <SelectPlaceholder
              title={t("tablet.selectEquipment")}
              body={t("tablet.selectEquipmentBody")}
            />
          }
        />
      ) : (
        masterPane
      )}
    </View>
  );
}

/** Equipment list + search — the host surface for the scan→checkout hero flow. */
export function EquipmentListScreen(props: RootStackScreenProps<"EquipmentList">) {
  return (
    <BootstrapGate>
      <EquipmentListBody {...props} />
    </BootstrapGate>
  );
}
