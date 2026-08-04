/**
 * The scan→checkout mutation. Equipment custody is NOT emergency state, so
 * optimistic-with-rollback is allowed (unlike Code Blue mutations).
 *
 * FROZEN SURFACE: scan is ONLINE-ONLY. A network / AuthFetchError failure lands in
 * `onError` → rollback → LOUD feedback. It is NEVER queued for offline replay.
 *
 * `api.equipment.scan()` returns a closed `ScanResult` union (it does NOT throw for
 * 409/404), so the branch happens in `onSuccess`:
 *   - kind 'ok'                  → reconcile caches to the server row, success haptic.
 *   - kind 'conflict'            → ROLL BACK, error haptic (holder email surfaced).
 *   - kind 'not_found'/'blocked' → ROLL BACK, error haptic.
 * `onSettled` invalidates `['equipment']` belt-and-suspenders.
 */
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { equipmentKeys , api } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { mark, MARK } from "@/lib/instrumentation/perf";
import type { EquipmentListPage, EquipmentRow, ScanResult } from "@/types/api";

type CacheSnapshot = [QueryKey, unknown][];

const CHECKED_OUT = "checked_out";
const AVAILABLE = "available";

function flipRow(row: EquipmentRow): EquipmentRow {
  const nowCheckedOut = row.custodyState === CHECKED_OUT;
  return {
    ...row,
    custodyState: nowCheckedOut ? AVAILABLE : CHECKED_OUT,
    checkedOutByEmail: nowCheckedOut ? undefined : row.checkedOutByEmail,
  };
}

function isListPage(data: unknown): data is EquipmentListPage {
  return !!data && typeof data === "object" && Array.isArray((data as EquipmentListPage).items);
}

function isRow(data: unknown): data is EquipmentRow {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as EquipmentRow).id === "string" &&
    "custodyState" in (data as EquipmentRow)
  );
}

/**
 * Optimistically flip the target row inside every cached list page + the detail
 * cache. The list query stores an `EquipmentListPage` (has `items`); the detail
 * query stores a bare `EquipmentRow` — discriminate on the SHAPE that is actually
 * cached (not the wrapper `EquipmentListResult`, which is never stored).
 */
function applyOptimisticFlip(
  snapshot: CacheSnapshot,
  equipmentId: string,
): CacheSnapshot {
  return snapshot.map(([key, data]) => {
    if (isListPage(data)) {
      const next: EquipmentListPage = {
        ...data,
        items: data.items.map((item) => (item.id === equipmentId ? flipRow(item) : item)),
      };
      return [key, next];
    }
    if (isRow(data) && data.id === equipmentId) {
      return [key, flipRow(data)];
    }
    return [key, data];
  });
}

export type ScanToggleContext = { previous: CacheSnapshot };

export function useScanToggle() {
  const queryClient = useQueryClient();

  const rollback = (context: ScanToggleContext | undefined): void => {
    if (!context) return;
    for (const [key, data] of context.previous) {
      queryClient.setQueryData(key, data);
    }
  };

  return useMutation<ScanResult, unknown, string, ScanToggleContext>({
    mutationFn: (equipmentId: string) => api.equipment.scan(equipmentId),

    onMutate: async (equipmentId): Promise<ScanToggleContext> => {
      // Perceived-latency floor (O3) is measured at the optimistic commit.
      mark(MARK.scanVisualAck);
      await queryClient.cancelQueries({ queryKey: equipmentKeys.all });
      const previous = queryClient.getQueriesData({ queryKey: equipmentKeys.all });
      const optimistic = applyOptimisticFlip(previous, equipmentId);
      for (const [key, data] of optimistic) {
        queryClient.setQueryData(key, data);
      }
      return { previous };
    },

    onSuccess: (result, _equipmentId, context) => {
      if (result.kind === "ok") {
        mark(MARK.scanServerConfirmed);
        // Reconcile the detail + list caches to the authoritative server row.
        queryClient.setQueryData(equipmentKeys.detail(result.equipment.id), result.equipment);
        haptics.scanSuccess();
        return;
      }
      // conflict / not_found / blocked_precondition → the server rejected: roll back.
      rollback(context);
      haptics.error();
    },

    onError: (_error, _equipmentId, context) => {
      // Network / AuthFetchError — online-only, fail loud. Roll back the optimism.
      rollback(context);
      haptics.error();
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });
}
