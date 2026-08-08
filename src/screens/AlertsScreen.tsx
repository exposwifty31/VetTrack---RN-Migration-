/**
 * Alerts — G3 Slice 6. Alerts are CLIENT-derived from equipment status
 * (issue > overdue > sterilization_due > inactive; one per item, worst-first)
 * and joined with acknowledgement rows under the two-level model (SEEN keeps
 * alerting, RESOLVED stops the reminder but the derived alert stays visible;
 * rows are never deleted). Ported from the web `use-alerts-controller` /
 * `computeAlerts` semantics; the derivation is a pure lib (`alerts-derive.ts`).
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useEquipmentRealtimeSync` covers the derivation
 *     inputs (the source list nests under the canonical `["equipment"]` key),
 *     and `useRealtimeInvalidation` on the `alert_seen`/`alert_resolved` audit
 *     actionTypes refreshes the acks. No polling, no refetchInterval; KEEPALIVE
 *     never invalidates.
 *   - Reads are universal (student+); acknowledge/resolve are pre-gated to
 *     senior_technician+ via `canManageAlerts` AND a server 403 maps to an
 *     inline note — never an error toast.
 *   - Rows are opaque; severity is a static semantic `Chip` (danger never
 *     glassed/animated); the resolve sheet is the screen's ONE blur layer, only
 *     while open, and it gates the content behind it so no tap leaks through.
 *
 * Route registered by Slice 1 and gated by `GatedAlerts` (BootstrapGate) — this
 * screen does not re-wrap. Navigation to `EquipmentDetail` goes through the
 * typed `useNavigation` hook (the nav files are frozen this wave).
 */
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { AlertsListContent } from "@/components/alerts/AlertsListContent";
import { ResolveSheet } from "@/components/alerts/ResolveSheet";
import { AuroraBackground } from "@/components/home/AuroraBackground";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useEquipmentRealtimeSync } from "@/hooks/useEquipmentRealtimeSync";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  alertAckKeys,
  ALERT_ACK_AUDIT_ACTION_TYPES,
  alertAcksApi,
} from "@/lib/api/alert-acks";
import { ApiCodedError, retryUnlessClientError } from "@/lib/api/coded-error";
import { api } from "@/lib/api";
import {
  alertAckKey,
  canManageAlerts,
  deriveAlertsView,
  type AlertViewRow,
} from "@/lib/alerts-derive";
import type { EquipmentRow } from "@/types/api";

import type { RootStackParamList } from "../navigation/types";

/**
 * One-page fleet fetch for the derivation (server clamps to ≤1000). A clinic
 * beyond 1000 equipment would derive alerts only for the first page — acceptable
 * for the daily-driver bar; the full-fleet paging path is out of G3 scope.
 */
const EQUIPMENT_FLEET_LIMIT = 1000;
const ALERTS_EQUIPMENT_KEY = ["equipment", "alerts-source"] as const;

type AlertsNavigation = NativeStackNavigationProp<RootStackParamList, "Alerts">;

async function fetchAlertEquipment(): Promise<EquipmentRow[]> {
  const res = await api.equipment.list({ limit: EQUIPMENT_FLEET_LIMIT });
  return res.status === 200 ? res.data.items : [];
}

type AlertActionErrorKey = "alerts.actionError" | "alerts.actionForbidden";

function actionErrorKeyFor(error: unknown): AlertActionErrorKey {
  if (error instanceof ApiCodedError && error.status === 403) return "alerts.actionForbidden";
  return "alerts.actionError";
}

export function AlertsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<AlertsNavigation>();
  const queryClient = useQueryClient();

  // BootstrapGate (GatedAlerts) resolved identity before mounting us.
  const identity = useIdentity();
  const canManage = canManageAlerts(identity.data?.effectiveRole);

  useEquipmentRealtimeSync();
  useRealtimeInvalidation({
    auditActionTypes: ALERT_ACK_AUDIT_ACTION_TYPES,
    queryKeys: [alertAckKeys.all],
  });

  const equipmentQuery = useQuery<EquipmentRow[]>({
    queryKey: ALERTS_EQUIPMENT_KEY,
    queryFn: fetchAlertEquipment,
  });

  // Acks are secondary: an ack-list failure still renders alerts (every row
  // reads "unclaimed"), mirroring the web `hasAckError` degrade.
  const acksQuery = useQuery({
    queryKey: alertAckKeys.list(),
    queryFn: alertAcksApi.list,
    retry: retryUnlessClientError,
  });

  const view = useMemo(() => {
    if (!equipmentQuery.data) return null;
    return deriveAlertsView(equipmentQuery.data, acksQuery.data, equipmentQuery.dataUpdatedAt);
  }, [equipmentQuery.data, acksQuery.data, equipmentQuery.dataUpdatedAt]);

  const [resolvingRow, setResolvingRow] = useState<AlertViewRow | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<AlertActionErrorKey | null>(null);

  const invalidateAcks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: alertAckKeys.all });
  }, [queryClient]);

  const ackMutation = useMutation({
    mutationFn: (vars: { equipmentId: string; alertType: string }) =>
      alertAcksApi.acknowledge(vars.equipmentId, vars.alertType),
    onMutate: (vars) => {
      setActionErrorKey(null);
      setPendingKey(alertAckKey(vars.equipmentId, vars.alertType));
    },
    onSuccess: invalidateAcks,
    onError: (error) => setActionErrorKey(actionErrorKeyFor(error)),
    onSettled: () => setPendingKey(null),
  });

  const resolveMutation = useMutation({
    mutationFn: (vars: { ackId: string; note?: string }) =>
      alertAcksApi.resolve(vars.ackId, vars.note),
    onMutate: () => setActionErrorKey(null),
    onSuccess: () => {
      invalidateAcks();
      setResolvingRow(null);
    },
    onError: (error) => setActionErrorKey(actionErrorKeyFor(error)),
    onSettled: () => setPendingKey(null),
  });

  const onNavigate = useCallback(
    (equipmentId: string) => navigation.navigate("EquipmentDetail", { equipmentId }),
    [navigation],
  );

  const onAcknowledge = useCallback(
    (row: AlertViewRow) => {
      ackMutation.mutate({ equipmentId: row.alert.equipmentId, alertType: row.alert.type });
    },
    [ackMutation],
  );

  const onResolve = useCallback((row: AlertViewRow) => {
    setActionErrorKey(null);
    setResolvingRow(row);
  }, []);

  const closeSheet = useCallback(() => {
    setResolvingRow(null);
    setActionErrorKey(null);
  }, []);

  const onConfirmResolve = useCallback(
    (note: string | undefined) => {
      const ackId = resolvingRow?.ack?.id;
      if (!ackId) return;
      setPendingKey(`${resolvingRow.alert.equipmentId}:${resolvingRow.alert.type}`);
      resolveMutation.mutate({ ackId, note });
    },
    [resolvingRow, resolveMutation],
  );

  const onRetry = useCallback(() => {
    void equipmentQuery.refetch();
    void acksQuery.refetch();
  }, [equipmentQuery, acksQuery]);

  const showListError = actionErrorKey && !resolvingRow;

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View
        className="flex-1 px-[22px] pt-3"
        pointerEvents={resolvingRow ? "none" : "auto"}
      >
        {view && view.total > 0 ? (
          <Text className="mb-2.5 font-rubik text-[13px] text-muted">
            {t("alerts.summary", { total: view.total, urgent: view.urgentCount })}
          </Text>
        ) : null}

        {showListError ? (
          <Text className="mb-2.5 text-center font-rubik text-[13px] text-danger">
            {t(actionErrorKey)}
          </Text>
        ) : null}

        <AlertsListContent
          view={view}
          isPending={equipmentQuery.isPending}
          isError={equipmentQuery.isError}
          canManage={canManage}
          pendingKey={pendingKey}
          onRetry={onRetry}
          onNavigate={onNavigate}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />
      </View>

      {resolvingRow ? (
        <View style={StyleSheet.absoluteFill}>
          <BottomSheet onDismiss={closeSheet}>
            <ResolveSheet
              equipmentName={resolvingRow.alert.equipmentName}
              isPending={resolveMutation.isPending}
              errorMessage={actionErrorKey ? t(actionErrorKey) : null}
              onConfirm={onConfirmResolve}
              onCancel={closeSheet}
            />
          </BottomSheet>
        </View>
      ) : null}
    </View>
  );
}
