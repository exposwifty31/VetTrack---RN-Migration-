/**
 * תפריט tab — hosts the sign-in entry and every existing debug/dev screen so
 * nothing reachable from the old G1 home is lost (they all stay root-stack
 * routes; this is just their new front door).
 */
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/PressableScale";
import type { MainTabScreenProps, RootStackParamList } from "@/navigation/types";

type MenuLabelKey =
  | "home.signIn"
  | "home.apiSmoke"
  | "home.nfcSpike"
  | "home.storageDebug"
  | "home.realtimeDebug"
  | "home.i18nDebug"
  | "home.g2Measure";

/** Root-stack routes navigable without params — keeps MENU_ROUTES compile-checked. */
type ParamFreeRoute = {
  [K in keyof RootStackParamList]: undefined extends RootStackParamList[K] ? K : never;
}[keyof RootStackParamList];

const MENU_ROUTES: { route: ParamFreeRoute; labelKey: MenuLabelKey }[] = [
  { route: "SignIn", labelKey: "home.signIn" },
  { route: "ApiSmoke", labelKey: "home.apiSmoke" },
  { route: "NfcSpike", labelKey: "home.nfcSpike" },
  { route: "StorageDebug", labelKey: "home.storageDebug" },
  { route: "RealtimeDebug", labelKey: "home.realtimeDebug" },
  { route: "I18nDebug", labelKey: "home.i18nDebug" },
  { route: "G2Measure", labelKey: "home.g2Measure" },
];

export function MenuScreen({ navigation }: MainTabScreenProps<"Menu">) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
    >
      <View className="gap-2.5 px-[22px]">
        <Text className="font-rubik-bold text-[22px] text-foreground">{t("menu.title")}</Text>
        <Text className="mt-1 font-rubik-semibold text-[12.5px] text-text-tertiary">
          {t("menu.devSection")}
        </Text>
        {MENU_ROUTES.map(({ route, labelKey }) => (
          <PressableScale
            key={route}
            accessibilityRole="button"
            className="min-h-[48px] justify-center rounded-sm border border-border bg-surface px-4 py-3"
            onPress={() => navigation.navigate(route)}
          >
            <Text className="font-rubik-medium text-[15px] text-foreground">{t(labelKey)}</Text>
          </PressableScale>
        ))}
      </View>
    </ScrollView>
  );
}
