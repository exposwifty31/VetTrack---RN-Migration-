/**
 * "Verified snapshot" section — GET /:id/truth (Asset Copilot evidence graph,
 * vendored `EquipmentTruthResponse`). Renders the resolver's location summary,
 * custodian claims with confidence chips, and the honest unknowns list.
 * Resolver strings are server-generated English — LTR-isolated inside the RTL
 * layout. Advisory-only surface: it never overrides the custody/location cards.
 */
import type { EquipmentTruthResponse } from "@vettrack/shared";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { api, equipmentKeys } from "@/lib/api";

import { SectionTitle } from "./DetailBits";
import { confidenceTone } from "./equipment-detail-derive";

const LTR = { writingDirection: "ltr" } as const;

type TFn = ReturnType<typeof useTranslation>["t"];

function confidenceLabel(t: TFn, tone: ReturnType<typeof confidenceTone>): string {
  switch (tone) {
    case "success":
      return t("equipmentDetail.truth.confidence.high");
    case "info":
      return t("equipmentDetail.truth.confidence.medium");
    case "warning":
      return t("equipmentDetail.truth.confidence.low");
    default:
      return t("equipmentDetail.truth.confidence.stale");
  }
}

export function TruthCard({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const { t } = useTranslation();

  const query = useQuery<EquipmentTruthResponse>({
    queryKey: equipmentKeys.truth(equipmentId),
    queryFn: () => api.equipment.truth(equipmentId),
  });

  return (
    <SectionCard>
      <SectionTitle title={t("equipmentDetail.truth.title")} />
      {query.isPending ? (
        <RowSkeleton />
      ) : query.isError ? (
        <ErrorNote
          message={t("equipmentDetail.truth.loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <View className="gap-2.5">
          <Text className="font-rubik text-[14px] text-foreground" style={LTR}>
            {query.data.location.summary}
          </Text>

          {query.data.custodian.claims.length > 0 ? (
            <View className="gap-1.5">
              <Text className="font-rubik-medium text-[13px] text-muted">
                {t("equipmentDetail.truth.custodian")}
              </Text>
              {query.data.custodian.claims.map((claim) => {
                const tone = confidenceTone(claim.confidence);
                return (
                  <View key={claim.key} className="flex-row items-center justify-between gap-3">
                    <Text
                      className="flex-1 font-rubik text-[13px] text-foreground"
                      style={LTR}
                      numberOfLines={2}
                    >
                      {claim.value}
                    </Text>
                    <Chip label={confidenceLabel(t, tone)} tone={tone} />
                  </View>
                );
              })}
            </View>
          ) : null}

          {query.data.deployability.unknowns.length + query.data.custodian.unknowns.length > 0 ? (
            <View className="gap-0.5">
              <Text className="font-rubik-medium text-[13px] text-muted">
                {t("equipmentDetail.truth.unknowns")}
              </Text>
              {[...query.data.deployability.unknowns, ...query.data.custodian.unknowns].map(
                (unknown) => (
                  <Text
                    key={unknown}
                    className="font-rubik text-[12px] text-text-tertiary"
                    style={LTR}
                  >
                    {unknown}
                  </Text>
                ),
              )}
            </View>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}
