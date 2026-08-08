/**
 * The alerts list's state ladder — loading / error / empty / list — plus the
 * flattened section list (urgent then maintenance) rendered through ONE
 * FlashList (mandatory for lists). Section headers and alert rows are distinct
 * `getItemType`s so recycling stays cheap. Loading is honest static skeletons
 * (no shimmer); errors reuse the Slice-1 `ErrorNote`.
 *
 * Reads are universal, so there is no off-shift state here — the list never
 * 403s; only the ack/resolve mutations gate at senior_technician+ (handled on
 * the screen).
 */
import { useCallback } from "react";
import { Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";

import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import type { AlertSectionKey, AlertsView, AlertViewRow } from "@/lib/alerts-derive";

import { AlertRow } from "./AlertRow";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

const SECTION_LABEL_KEY = {
  urgent: "alerts.section.urgent",
  maintenance: "alerts.section.maintenance",
} as const satisfies Record<AlertSectionKey, string>;

type ListEntry =
  | { kind: "header"; key: string; sectionKey: AlertSectionKey }
  | { kind: "row"; key: string; row: AlertViewRow };

function toEntries(view: AlertsView): ListEntry[] {
  const entries: ListEntry[] = [];
  for (const section of view.sections) {
    entries.push({ kind: "header", key: `h:${section.key}`, sectionKey: section.key });
    for (const row of section.rows) {
      entries.push({
        kind: "row",
        key: `${row.alert.equipmentId}:${row.alert.type}`,
        row,
      });
    }
  }
  return entries;
}

export type AlertsListContentProps = Readonly<{
  view: AlertsView | null;
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  /** `${equipmentId}:${alertType}` currently mutating, or null. */
  pendingKey: string | null;
  onRetry: () => void;
  onNavigate: (equipmentId: string) => void;
  onAcknowledge: (row: AlertViewRow) => void;
  onResolve: (row: AlertViewRow) => void;
}>;

export function AlertsListContent({
  view,
  isPending,
  isError,
  canManage,
  pendingKey,
  onRetry,
  onNavigate,
  onAcknowledge,
  onResolve,
}: AlertsListContentProps) {
  const { t } = useTranslation();

  const renderItem = useCallback<ListRenderItem<ListEntry>>(
    ({ item }) => {
      if (item.kind === "header") {
        return (
          <Text className="mb-1.5 mt-1 font-rubik-semibold text-[13px] uppercase tracking-wide text-muted">
            {t(SECTION_LABEL_KEY[item.sectionKey])}
          </Text>
        );
      }
      return (
        <AlertRow
          row={item.row}
          canManage={canManage}
          isPending={pendingKey === item.key}
          onNavigate={onNavigate}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />
      );
    },
    [t, canManage, pendingKey, onNavigate, onAcknowledge, onResolve],
  );

  if (isPending) {
    return (
      <View className="flex-1 pt-1">
        {SKELETON_ROWS.map((i) => (
          <RowSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center">
        <ErrorNote message={t("alerts.loadError")} onRetry={onRetry} />
      </View>
    );
  }

  if (!view || view.total === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("alerts.empty")} body={t("alerts.emptyBody")} />
      </View>
    );
  }

  return (
    <FlashList
      data={toEntries(view)}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
