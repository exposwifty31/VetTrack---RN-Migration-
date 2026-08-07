/**
 * Readiness card (README.md §4) — quiet surface, success hero %, 4-column
 * metric grid (RTL order: מוכן · לא מוכן · מושאלים · בשימוש). Numbers render
 * LTR. Problem metrics color only when non-zero (light theme uses the AA
 * on-tint darks #B91C1C / #92400E per direction-1c iteration 2).
 * `readiness: null` (not loaded yet / fetch failed) renders honest dashes —
 * never a fabricated 100%.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import type { Readiness } from "@/lib/home-readiness";

function MetricColumn({
  value,
  label,
  colorClass,
}: Readonly<{
  value: number | null;
  label: string;
  colorClass: string;
}>) {
  return (
    <View className="flex-1 items-center">
      <Text
        className={`font-rubik-bold text-[17px] ${colorClass}`}
        style={{ writingDirection: "ltr" }}
      >
        {value == null ? "—" : String(value)}
      </Text>
      <Text className="mt-[1px] font-rubik text-[10.5px] text-muted">{label}</Text>
    </View>
  );
}

export function ReadinessCard({ readiness }: Readonly<{ readiness: Readiness | null }>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  const notReadyProblemClass = light ? "text-[#B91C1C]" : "text-danger";
  const notReadyColor =
    readiness != null && readiness.notReady > 0 ? notReadyProblemClass : "text-foreground";
  const checkedOutProblemClass = light ? "text-[#92400E]" : "text-warning";
  const checkedOutColor =
    readiness != null && readiness.checkedOut > 0 ? checkedOutProblemClass : "text-foreground";

  return (
    <View className="px-[22px] pt-2.5">
      <View
        className="rounded-[24px] border border-border bg-surface px-5 py-3.5"
        style={{ boxShadow: light ? "0 8px 20px rgba(23,19,49,0.04)" : undefined }}
      >
        <View className="flex-row items-baseline gap-2.5">
          <Text className="font-rubik-semibold text-[12.5px] text-text-tertiary">
            {t("aurora.readinessTitle")}
          </Text>
          <View className="flex-1" />
          <Text
            className="font-rubik-bold text-[26px] text-success"
            style={{ writingDirection: "ltr" }}
          >
            {readiness?.coveragePct == null ? "—" : `${readiness.coveragePct}%`}
          </Text>
          <Text className="font-rubik text-[12.5px] text-muted">{t("aurora.coverageLabel")}</Text>
        </View>
        <View className="mb-2 mt-2.5 h-px bg-[rgba(167,139,250,0.12)] light:bg-[#F0EDF8]" />
        <View className="flex-row">
          <MetricColumn
            value={readiness?.ready ?? null}
            label={t("aurora.metricReady")}
            colorClass="text-foreground"
          />
          <MetricColumn
            value={readiness?.notReady ?? null}
            label={t("aurora.metricNotReady")}
            colorClass={notReadyColor}
          />
          <MetricColumn
            value={readiness?.checkedOut ?? null}
            label={t("aurora.metricCheckedOut")}
            colorClass={checkedOutColor}
          />
          <MetricColumn
            value={readiness?.inUse ?? null}
            label={t("aurora.metricInUse")}
            colorClass="text-foreground"
          />
        </View>
      </View>
    </View>
  );
}
