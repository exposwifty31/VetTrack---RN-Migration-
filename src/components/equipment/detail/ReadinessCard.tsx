/**
 * Deployability/readiness section — GET /api/equipment/:id/deployability.
 * Headline chip (deployable/not), the three operational states as rows, and
 * the bundle-gate block reasons when the gate fails. Static semantic colors
 * only; the danger family never animates (Chip is static by construction).
 */
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { api, equipmentKeys } from "@/lib/api";
import type { EquipmentDeployability } from "@/types/api";

import { KeyValueRow, SectionTitle } from "./DetailBits";

type TFn = ReturnType<typeof useTranslation>["t"];

// Known enum values render translated; an unknown server value falls through
// as the raw literal, LTR-isolated (an identifier, never fabricated copy).

function custodyStateLabel(t: TFn, value: string): string | null {
  switch (value) {
    case "available":
      return t("equipmentDetail.custodyState.available");
    case "checked_out":
      return t("equipmentDetail.custodyState.checked_out");
    case "untracked":
      return t("equipmentDetail.custodyState.untracked");
    default:
      return null;
  }
}

function readinessLabel(t: TFn, value: string): string | null {
  switch (value) {
    case "ready":
      return t("equipmentDetail.readinessValue.ready");
    case "not_ready":
      return t("equipmentDetail.readinessValue.not_ready");
    case "unknown":
      return t("equipmentDetail.readinessValue.unknown");
    default:
      return null;
  }
}

function usageLabel(t: TFn, value: string): string | null {
  switch (value) {
    case "available":
      return t("equipmentDetail.usageValue.available");
    case "in_use":
      return t("equipmentDetail.usageValue.in_use");
    case "staged":
      return t("equipmentDetail.usageValue.staged");
    case "emergency_use":
      return t("equipmentDetail.usageValue.emergency_use");
    default:
      return null;
  }
}

function EnumRow({
  label,
  known,
  raw,
}: Readonly<{ label: string; known: string | null; raw: string }>) {
  return <KeyValueRow label={label} value={known ?? raw} ltr={known == null} />;
}

export function ReadinessCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const { t } = useTranslation();

  const query = useQuery<EquipmentDeployability>({
    queryKey: equipmentKeys.deployability(equipmentId),
    queryFn: () => api.equipment.deployability(equipmentId),
  });

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.readiness.title")} />
      {query.isPending ? (
        <RowSkeleton />
      ) : query.isError ? (
        <ErrorNote
          message={t("equipmentDetail.readiness.loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <View className="gap-2">
          <Chip
            label={
              query.data.fullDeployable
                ? t("equipmentDetail.readiness.deployable")
                : t("equipmentDetail.readiness.notDeployable")
            }
            tone={query.data.fullDeployable ? "success" : "warning"}
          />
          <View>
            <EnumRow
              label={t("equipmentDetail.readiness.custody")}
              known={custodyStateLabel(t, query.data.custodyState)}
              raw={query.data.custodyState}
            />
            <EnumRow
              label={t("equipmentDetail.readiness.readinessState")}
              known={readinessLabel(t, query.data.readinessState)}
              raw={query.data.readinessState}
            />
            <EnumRow
              label={t("equipmentDetail.readiness.usage")}
              known={usageLabel(t, query.data.usageState)}
              raw={query.data.usageState}
            />
          </View>
          {!query.data.bundleGate.ok && query.data.bundleGate.reason ? (
            <Text className="font-rubik text-[13px] text-warning">
              {t("equipmentDetail.readiness.gateBlocked", { reason: query.data.bundleGate.reason })}
            </Text>
          ) : null}
          {query.data.bundleGate.failedConditions?.length ? (
            <Text className="font-rubik text-[13px] text-warning" style={{ writingDirection: "ltr" }}>
              {t("equipmentDetail.readiness.failedConditions", {
                list: query.data.bundleGate.failedConditions.join(", "),
              })}
            </Text>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}
