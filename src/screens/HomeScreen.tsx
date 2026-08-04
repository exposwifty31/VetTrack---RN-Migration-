import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { contractsBridgeSmoke } from "@/lib/contracts-bridge";
import { DelightSpike } from "./DelightSpike";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * G1 foundation home. Styled with Uniwind className; copy via i18next (Slice 6).
 */
export function HomeScreen({ navigation }: RootStackScreenProps<"Home">) {
  const { t } = useTranslation();
  const bridge = contractsBridgeSmoke();

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-4xl font-extrabold text-foreground">{t("home.title")}</Text>
      <Text className="mb-2 mt-1 text-[15px] text-muted">
        {t("home.subtitle", {
          allowlist: bridge.allowlistSize,
          days: bridge.inactiveThresholdDays,
        })}
      </Text>

      <DelightSpike />

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("SignIn")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">{t("home.signIn")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("ApiSmoke")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.apiSmoke")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("NfcSpike")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.nfcSpike")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("StorageDebug")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.storageDebug")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("I18nDebug")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.i18nDebug")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("RealtimeDebug")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">
          Open realtime debug (Slice 5)
        </Text>
      </Pressable>
    </View>
  );
}
