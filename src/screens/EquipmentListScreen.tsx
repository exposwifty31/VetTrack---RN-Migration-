import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { BootstrapGate } from "@/app/BootstrapGate";
import { PressableScale } from "@/components/PressableScale";
import { EquipmentRow, type RowPressHandler } from "@/components/equipment/EquipmentRow";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { FORWARD_ARROW } from "@/components/home/glyphs";
import { SearchIcon } from "@/components/home/icons";
import { useDualFrameSampler } from "@/hooks/useDualFrameSampler";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys, type EquipmentListParams } from "@/lib/api";
import { mark, MARK } from "@/lib/instrumentation/perf";
import type { EquipmentListPage } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

const EMPTY_PAGE: EquipmentListPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0,
  hasMore: false,
};

function EquipmentListBody({ navigation, route }: RootStackScreenProps<"EquipmentList">) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { theme } = useUniwind();
  const light = theme === "light";
  useEquipmentRealtimeSync();

  // Seed the search from an initialQuery param — the NFC advisory fallback: a
  // non-canonical tag (no extractable id) lands here pre-filtered by its payload.
  const [query, setQuery] = useState(route.params?.initialQuery ?? "");
  // useDeferredValue keeps typing responsive while the filtered query re-runs.
  const deferredQuery = useDeferredValue(query);
  const params: EquipmentListParams = deferredQuery ? { q: deferredQuery } : {};
  const queryKey = equipmentKeys.list(params);

  // ETag threading scoped PER query key: a shared single-slot ref would send one
  // search's ETag on another search's request, so a 304 would return the wrong
  // page. Key the ETag + cached page on the (normalized) query key.
  const cacheRef = useRef<Map<string, { etag?: string; page: EquipmentListPage }>>(new Map());

  const listQuery = useQuery<EquipmentListPage>({
    queryKey,
    queryFn: async () => {
      const cacheKey = JSON.stringify(queryKey);
      const cached = cacheRef.current.get(cacheKey);
      const res = await api.equipment.list(params, cached?.etag);
      if (res.status === 304) {
        return (
          cached?.page ??
          queryClient.getQueryData<EquipmentListPage>(queryKey) ??
          EMPTY_PAGE
        );
      }
      cacheRef.current.set(cacheKey, { etag: res.etag, page: res.data });
      return res.data;
    },
  });

  // Cold-TTI (O4) end marker: the list is interactive on its FIRST successful
  // render. A ref latches for the screen lifetime so a later search re-entering
  // `isSuccess` cannot overwrite the mark with user-search time (measureTTI picks
  // the latest `screenInteractive`).
  const markedInteractive = useRef(false);
  useEffect(() => {
    if (listQuery.isSuccess && !markedInteractive.current) {
      markedInteractive.current = true;
      mark(MARK.screenInteractive);
    }
  }, [listQuery.isSuccess]);

  const onRowPress = useCallback<RowPressHandler>(
    (item) => {
      navigation.navigate("ScanConfirm", {
        equipmentId: item.id,
        prefill: { name: item.name, status: item.status },
      });
    },
    [navigation],
  );

  // O1/O2 scroll segment: sample frames (JS rAF + UI useFrameCallback) while the
  // FlashList scrolls. Drag and momentum are separate sampled segments that
  // concatenate in the perf sink — start/stop are idempotent, so the drag→momentum
  // hand-off (end-drag fires before momentum-begin) costs at most one frame gap.
  const { start: startScrollSampling, stop: stopScrollSampling } = useDualFrameSampler();

  const items = listQuery.data?.items ?? [];

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
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

        {listQuery.isPending ? (
          <View className="flex-1 items-center justify-center gap-2.5">
            <ActivityIndicator color={light ? "#6D28D9" : "#A78BFA"} />
            <Text className="font-rubik text-[13px] text-muted">{t("common.loading")}</Text>
          </View>
        ) : listQuery.isError ? (
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
              <EquipmentRow item={item} onPress={onRowPress} sampledAtMs={listQuery.dataUpdatedAt} />
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
