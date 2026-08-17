/**
 * Scan-history section — GET /:id/logs via useInfiniteQuery (page/limit
 * envelope, hasMore-driven next page). Bounded pages render inline in the
 * detail ScrollView; "load more" is an explicit user action, never a poll.
 */
import { Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { api, equipmentKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { EquipmentLogItem, EquipmentLogsPage } from "@/types/api";

import { ltrIsolate, QuietButton, SectionTitle } from "./DetailBits";
import { statusTone } from "./equipment-detail-derive";

import { useT, type TFn } from "@/types/tfn";

const PAGE_SIZE = 20;

function statusLabel(t: TFn, status: string): string {
  switch (status) {
    case "ok":
      return t("equipmentDetail.status.ok");
    case "issue":
      return t("equipmentDetail.status.issue");
    case "maintenance":
      return t("equipmentDetail.status.maintenance");
    case "sterilized":
      return t("equipmentDetail.status.sterilized");
    case "overdue":
      return t("equipmentDetail.status.overdue");
    case "inactive":
      return t("equipmentDetail.status.inactive");
    case "critical":
      return t("equipmentDetail.status.critical");
    case "needs_attention":
      return t("equipmentDetail.status.needs_attention");
    default:
      return status;
  }
}

function LogRow({ item }: Readonly<{ item: EquipmentLogItem }>) {
  const t = useT();
  const when = formatDateTime(item.timestamp);
  return (
    <View className="gap-1 border-t border-border py-2.5">
      <View className="flex-row items-center justify-between gap-3">
        <Chip label={statusLabel(t, item.status)} tone={statusTone(item.status)} />
        {when ? (
          <Text className="font-rubik text-[12px] text-text-tertiary">{when}</Text>
        ) : null}
      </View>
      {item.note ? (
        <Text className="font-rubik text-[13px] text-foreground">{item.note}</Text>
      ) : null}
      {item.userEmail ? (
        <Text className="font-rubik text-[12px] text-text-tertiary" numberOfLines={1}>
          {ltrIsolate(item.userEmail)}
        </Text>
      ) : null}
    </View>
  );
}

export { statusLabel };

export function HistoryCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useT();

  const query = useInfiniteQuery({
    queryKey: equipmentKeys.logs(equipmentId),
    queryFn: ({ pageParam }) => api.equipment.logs(equipmentId, pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last: EquipmentLogsPage) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.history.title")} />
      {query.isPending ? (
        <RowSkeleton />
      ) : query.isError ? (
        <ErrorNote
          message={t("equipmentDetail.history.loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <Text className="font-rubik text-[13px] text-muted">
          {t("equipmentDetail.history.empty")}
        </Text>
      ) : (
        <View>
          {items.map((item) => (
            <LogRow key={item.id} item={item} />
          ))}
          {query.hasNextPage ? (
            <View className="mt-2.5">
              <QuietButton
                label={t("equipmentDetail.history.loadMore")}
                disabled={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
              />
            </View>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}
