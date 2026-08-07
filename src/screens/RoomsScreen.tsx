/** G3 route placeholder — honest coming-soon, zero fetching, zero blur. */
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import { ListEmptyState } from "@/components/ui/ListEmptyState";

export function RoomsScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("common.comingSoon")} />
      </View>
    </View>
  );
}
