/**
 * The five-row peek inside the bell dropdown. Rows are pressable straight
 * through to the equipment, so the common case (see it, act on it) never has to
 * pass through the full alerts page.
 */
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { AlertViewRow } from "@/lib/alerts-derive";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-danger-solid",
  high: "bg-danger-solid",
  medium: "bg-warning-solid",
  low: "bg-muted",
};

export function AlertsDropdownList({
  rows,
  isLoading,
  onRowPress,
}: Readonly<{
  rows: readonly AlertViewRow[];
  isLoading: boolean;
  onRowPress: (equipmentId: string) => void;
}>) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-[14px] text-muted">{t("aurora.alertsDropdownEmpty")}</Text>
      </View>
    );
  }

  return (
    <View>
      {rows.map((row) => (
        <PressableScale
          key={`${row.alert.equipmentId}:${row.alert.type}`}
          className="flex-row items-center gap-3 border-b border-border px-4 py-3"
          accessibilityRole="button"
          onPress={() => onRowPress(row.alert.equipmentId)}
        >
          <View
            className={`h-2 w-2 rounded-full ${SEVERITY_DOT[row.alert.severity] ?? "bg-muted"}`}
          />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
              {row.alert.equipmentName}
            </Text>
            <Text className="text-[12px] text-muted" numberOfLines={1}>
              {t(`alerts.type.${row.alert.type}`, { defaultValue: row.alert.type })}
            </Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}
