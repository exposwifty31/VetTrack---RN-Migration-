/**
 * Inventory — G3 Slice 10: container list (blueprint targets + aggregate qty)
 * with per-container Dispense + Restock actions.
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the verified container
 *     audit actionTypes (containers emit no dedicated domain events — Scout 3).
 *     KEEPALIVE never invalidates; no polling, no refetchInterval. Restock
 *     commits invalidate imperatively (the session program emits no audit rows).
 *   - Off-shift (403 INSUFFICIENT_ROLE from the student floor, OR a client role
 *     below student) → the dedicated off-shift empty state, never an error toast.
 *   - Rows are opaque `SectionCard`s; the ONE blur layer is whichever sheet is
 *     open (mutually exclusive → ≤1 blur holds). Emergency dispense is solid
 *     danger, never glassed/animated.
 *   - The Inventory route is param-free (nav frozen); a scanned container is
 *     handed over via a one-shot module ref, consumed ONCE at mount by a lazy
 *     `useState` initializer (never a setState effect — repo lint rule).
 *
 * Rendered inside `GatedInventory`'s BootstrapGate, so identity is resolved.
 */
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { ContainerRow } from "@/components/inventory/ContainerRow";
import { DispenseSheet } from "@/components/inventory/DispenseSheet";
import { consumePendingDispenseContainer } from "@/components/inventory/pending-container";
import { RestockSheet } from "@/components/inventory/RestockSheet";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  CONTAINER_AUDIT_ACTION_TYPES,
  containerKeys,
  containersApi,
  isOffShiftError,
  retryUnlessClientError,
} from "@/lib/api/containers";
import { hasRoleAtLeast } from "@/lib/roles";
import type { ContainerListItem } from "@/types/containers";

type SheetState =
  | Readonly<{ kind: "dispense"; container: { id: string; name: string } }>
  | Readonly<{ kind: "restock"; container: { id: string; name: string } }>
  | null;

export function InventoryScreen() {
  const { t } = useTranslation();

  const identity = useIdentity();
  const effectiveRole = identity.data?.effectiveRole ?? identity.data?.role ?? "";
  const canUse = hasRoleAtLeast(effectiveRole, "student");

  // Consume the scan→dispense hand-off exactly once, at mount (lazy init — never
  // a setState effect). A tap opens the sheet the same way afterward.
  const [sheet, setSheet] = useState<SheetState>(() => {
    const pending = consumePendingDispenseContainer();
    return pending ? { kind: "dispense", container: pending } : null;
  });

  useRealtimeInvalidation({
    auditActionTypes: CONTAINER_AUDIT_ACTION_TYPES,
    queryKeys: [containerKeys.all],
  });

  const listQuery = useQuery<ContainerListItem[], Error>({
    queryKey: containerKeys.list(),
    queryFn: () => containersApi.list(),
    enabled: canUse,
    retry: retryUnlessClientError,
  });

  const onDispense = useCallback((container: ContainerListItem) => {
    setSheet({ kind: "dispense", container: { id: container.id, name: container.name } });
  }, []);

  const onRestock = useCallback((container: ContainerListItem) => {
    setSheet({ kind: "restock", container: { id: container.id, name: container.name } });
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  const renderItem = useCallback<ListRenderItem<ContainerListItem>>(
    ({ item }) => (
      <ContainerRow
        container={item}
        dispenseLabel={t("inventory.dispense")}
        restockLabel={t("inventory.restock")}
        onShelfLabel={t("inventory.onShelf")}
        targetLabel={t("inventory.target")}
        onDispense={onDispense}
        onRestock={onRestock}
      />
    ),
    [t, onDispense, onRestock],
  );

  const onRetry = useCallback(() => {
    void listQuery.refetch();
  }, [listQuery]);

  const offShift = !canUse || isOffShiftError(listQuery.error);
  const containers = listQuery.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        <View className="mb-3">
          <Text className="font-rubik-bold text-[20px] text-foreground">{t("inventory.title")}</Text>
          <Text className="mt-0.5 font-rubik text-[13px] text-muted">{t("inventory.subtitle")}</Text>
        </View>

        {offShift ? (
          <View className="flex-1 justify-center">
            <ListEmptyState
              title={t("inventory.offShiftTitle")}
              body={t("inventory.offShiftBody")}
            />
          </View>
        ) : listQuery.isPending ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : listQuery.isError ? (
          <ErrorNote message={t("inventory.loadError")} onRetry={onRetry} />
        ) : containers.length === 0 ? (
          <View className="flex-1 justify-center">
            <ListEmptyState title={t("inventory.empty")} body={t("inventory.emptyBody")} />
          </View>
        ) : (
          <FlashList
            data={containers}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>

      {sheet?.kind === "dispense" ? (
        <DispenseSheet container={sheet.container} onClose={closeSheet} />
      ) : null}
      {sheet?.kind === "restock" ? (
        <RestockSheet container={sheet.container} onClose={closeSheet} />
      ) : null}
    </View>
  );
}
