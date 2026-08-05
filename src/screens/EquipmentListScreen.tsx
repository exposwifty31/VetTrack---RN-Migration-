import { memo, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { BootstrapGate } from "@/app/BootstrapGate";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys, type EquipmentListParams } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { mark, MARK } from "@/lib/instrumentation/perf";
import type { EquipmentListPage, EquipmentRow as EquipmentRowType } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EMPTY_PAGE: EquipmentListPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0,
  hasMore: false,
};

type RowPressHandler = (item: EquipmentRowType) => void;

/** Module-scope, memoized row — a stable renderItem keeps FlashList recycling cheap. */
const EquipmentRow = memo(function EquipmentRow({
  item,
  onPress,
}: {
  item: EquipmentRowType;
  onPress: RowPressHandler;
}) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const held = item.custodyState === "checked_out";

  return (
    <AnimatedPressable
      style={animatedStyle}
      className="mb-2 rounded-xl border border-border bg-surface px-4 py-3.5 active:opacity-90"
      accessibilityRole="button"
      onPress={() => {
        haptics.tap();
        onPress(item);
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
    >
      <Text className="text-[16px] font-semibold text-foreground" numberOfLines={1}>
        {item.name}
      </Text>
      {held ? (
        item.checkedOutByEmail ? (
          <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1} style={{ writingDirection: "ltr" }}>
            {t("equipment.checkedOutBy", { email: item.checkedOutByEmail })}
          </Text>
        ) : (
          <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
            {t("equipment.held")}
          </Text>
        )
      ) : (
        <Text className="mt-0.5 text-[13px] text-info" numberOfLines={1}>
          {t("equipment.available")}
        </Text>
      )}
    </AnimatedPressable>
  );
});

function EquipmentListBody({ navigation, route }: RootStackScreenProps<"EquipmentList">) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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

  const items = listQuery.data?.items ?? [];

  return (
    <View className="flex-1 bg-background px-4 pt-3">
      <TextInput
        className="mb-3 rounded-xl border border-border bg-surface px-4 py-3 text-[15px] text-foreground"
        placeholder={t("equipment.searchPlaceholder")}
        placeholderTextColor="#64748b"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        accessibilityLabel={t("equipment.searchPlaceholder")}
      />

      <Pressable
        className="mb-3 items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => navigation.navigate("Scan")}
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">{t("home.scan")}</Text>
      </Pressable>

      {listQuery.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : listQuery.isError ? (
        <Text className="mt-6 text-center text-[15px] text-danger">{t("equipment.loadError")}</Text>
      ) : items.length === 0 ? (
        <Text className="mt-6 text-center text-[15px] text-muted">{t("equipment.empty")}</Text>
      ) : (
        <FlashList
          data={items}
          renderItem={({ item }) => <EquipmentRow item={item} onPress={onRowPress} />}
          keyExtractor={(item) => item.id}
          getItemType={(item) => item.status}
        />
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
