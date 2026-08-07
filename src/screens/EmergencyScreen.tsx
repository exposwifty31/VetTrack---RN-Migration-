/**
 * חירום tab — honest "בקרוב" placeholder. Emergency doctrine applies even to a
 * placeholder: danger-styled, ZERO glass/translucency, ZERO animation. The
 * Code Blue flows arrive in a later migration phase; this screen makes no
 * pretense of emergency capability.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { EmergencyGlyph } from "@/components/home/icons";

export function EmergencyScreen() {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const dangerSolid = theme === "light" ? "#B91C1C" : "#DC2626";

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: dangerSolid }}
      >
        <EmergencyGlyph color="#FFFFFF" />
      </View>
      <Text className="font-rubik-bold text-[22px] text-foreground">{t("tabs.emergency")}</Text>
      <Text className="font-rubik-semibold text-[15px] text-danger">
        {t("emergency.comingSoon")}
      </Text>
      <Text className="text-center font-rubik text-[13px] text-muted">
        {t("emergency.subtitle")}
      </Text>
    </View>
  );
}
