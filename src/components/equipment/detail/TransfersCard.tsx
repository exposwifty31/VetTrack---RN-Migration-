/**
 * Transfers section — GET /:id/transfers (bare array, newest first). Folder
 * names are clinic content (may be Hebrew) — rendered without LTR forcing;
 * the route sentence itself comes from i18n.
 */
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { api, equipmentKeys } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { EquipmentTransferItem } from "@/types/api";

import { SectionTitle } from "./DetailBits";

/**
 * A row is renderable when it carries a route, a note, or at least a parseable
 * timestamp (date-only fallback row) — filtering BEFORE the empty-state branch
 * so a payload of all-empty rows shows the honest empty state, never a blank card.
 */
export function hasTransferContent(item: EquipmentTransferItem): boolean {
  return Boolean(item.toFolderName || item.note || formatDateTime(item.timestamp) != null);
}

function TransferRow({ item }: Readonly<{ item: EquipmentTransferItem }>) {
  const { t } = useTranslation();
  const when = formatDateTime(item.timestamp);
  const route =
    item.fromFolderName && item.toFolderName
      ? t("equipmentDetail.transfers.route", { from: item.fromFolderName, to: item.toFolderName })
      : item.toFolderName
        ? t("equipmentDetail.transfers.routeToOnly", { to: item.toFolderName })
        : null;

  return (
    <View className="gap-0.5 border-t border-border py-2.5">
      {route ? (
        <Text className="font-rubik text-[13px] text-foreground" numberOfLines={2}>
          {route}
        </Text>
      ) : null}
      {item.note ? (
        <Text className="font-rubik text-[12px] text-muted" numberOfLines={2}>
          {item.note}
        </Text>
      ) : null}
      {when ? <Text className="font-rubik text-[12px] text-text-tertiary">{when}</Text> : null}
    </View>
  );
}

export function TransfersCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const { t } = useTranslation();

  const query = useQuery<EquipmentTransferItem[]>({
    queryKey: equipmentKeys.transfers(equipmentId),
    queryFn: () => api.equipment.transfers(equipmentId),
  });

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.transfers.title")} />
      {query.isPending ? (
        <RowSkeleton />
      ) : query.isError ? (
        <ErrorNote
          message={t("equipmentDetail.transfers.loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        (() => {
          const rows = query.data.filter(hasTransferContent);
          return rows.length === 0 ? (
            <Text className="font-rubik text-[13px] text-muted">
              {t("equipmentDetail.transfers.empty")}
            </Text>
          ) : (
            <View>
              {rows.map((item) => (
                <TransferRow key={item.id} item={item} />
              ))}
            </View>
          );
        })()
      )}
    </SectionCard>
  );
}
