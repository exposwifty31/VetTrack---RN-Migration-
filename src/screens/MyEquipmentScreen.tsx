/**
 * My Equipment — G3 Slice 4: the personal custody list ("what I hold") with
 * the web client's custody-debt semantics ported as a pure lib.
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useEquipmentRealtimeSync` — `/api/equipment/my`
 *     nests under the canonical ["equipment"] key, so the existing global
 *     equipment invalidation covers this list. No polling, no refetchInterval.
 *   - Rows reuse EquipmentRow (the list-screen grammar, opaque `--color-surface`
 *     cards); row press pushes EquipmentDetail where the return action lives.
 *   - Debt labels are static semantic-token colors — never danger, never
 *     animated; the only motion is PressableScale press feedback.
 *   - Zero blur layers.
 *
 * Dual-host screen: pushed on the root stack (native header via nav.myEquipment)
 * AND mounted as the custody-scoped Mine tab (MainTabs owns the tab-mode
 * safe-area). Self-gated via BootstrapGate (EquipmentListScreen precedent).
 */
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { BootstrapGate } from "@/app/BootstrapGate";
import { EquipmentRow, type RowPressHandler } from "@/components/equipment/EquipmentRow";
import {
  custodyDebtBadgeTone,
  deriveMyEquipmentView,
  type MyEquipmentEntry,
} from "@/components/equipment/my-equipment-derive";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { api, equipmentKeys } from "@/lib/api";
import type { MyEquipmentItem } from "@/types/api";

import type { RootStackScreenProps } from "../navigation/types";

function MyEquipmentBody({ navigation }: RootStackScreenProps<"MyEquipment">) {
  const { t } = useTranslation();
  useEquipmentRealtimeSync();

  const listQuery = useQuery<MyEquipmentItem[]>({
    queryKey: equipmentKeys.my(),
    queryFn: () => api.equipment.my(),
  });

  const view = useMemo(
    () =>
      listQuery.data && listQuery.data.length > 0
        ? deriveMyEquipmentView(listQuery.data, listQuery.dataUpdatedAt)
        : null,
    [listQuery.data, listQuery.dataUpdatedAt],
  );

  const onRowPress = useCallback<RowPressHandler>(
    (item) => {
      navigation.navigate("EquipmentDetail", { equipmentId: item.id });
    },
    [navigation],
  );

  const { dataUpdatedAt } = listQuery;
  const renderItem = useCallback<ListRenderItem<MyEquipmentEntry>>(
    ({ item: entry }) => (
      <View>
        {entry.badgeKey ? (
          <View className="mb-1 ms-1">
            <Chip label={t(entry.badgeKey)} tone={custodyDebtBadgeTone(entry.badgeKey)} />
          </View>
        ) : null}
        <EquipmentRow item={entry.row} onPress={onRowPress} sampledAtMs={dataUpdatedAt} />
      </View>
    ),
    [t, onRowPress, dataUpdatedAt],
  );

  const onRetry = useCallback(() => {
    void listQuery.refetch();
  }, [listQuery]);

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        <View className="mb-3">
          <Text className="font-rubik-bold text-[20px] text-foreground">
            {t("myEquipment.title")}
          </Text>
          {view ? (
            <Text className="mt-0.5 font-rubik text-[13px] text-muted">
              {t("myEquipment.checkedOutCount", { count: view.entries.length })}
            </Text>
          ) : null}
          <Text className="mt-0.5 font-rubik text-[12px] text-text-tertiary">
            {t("myEquipment.returnHint")}
          </Text>
        </View>

        {view?.bannerKey ? (
          // Aggregate debt banner — opaque surface, warning-token text, static.
          <View className="mb-2.5 rounded-[20px] border border-border bg-surface px-4 py-3">
            <Text className="font-rubik-semibold text-[13px] text-warning">
              {t(view.bannerKey, { count: view.debt.attentionCount })}
            </Text>
            {view.breakdown.length > 0 ? (
              <Text className="mt-[2px] font-rubik text-[12px] text-muted">
                {view.breakdown
                  .map((segment) => t(segment.key, { count: segment.count }))
                  .join(" · ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {listQuery.isPending ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : listQuery.isError ? (
          <ErrorNote message={t("common.errorGeneric")} onRetry={onRetry} />
        ) : !view ? (
          <View className="flex-1 justify-center">
            <ListEmptyState title={t("myEquipment.empty")} body={t("myEquipment.emptyBody")} />
          </View>
        ) : (
          <FlashList
            data={view.entries}
            renderItem={renderItem}
            keyExtractor={(entry) => entry.id}
            getItemType={(entry) => (entry.badgeKey ? "flagged" : "plain")}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </View>
  );
}

/** Personal custody list — self-gated (identity must resolve before /my fires). */
export function MyEquipmentScreen(props: RootStackScreenProps<"MyEquipment">) {
  return (
    <BootstrapGate>
      <MyEquipmentBody {...props} />
    </BootstrapGate>
  );
}
