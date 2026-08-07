import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { contractsBridgeSmoke } from "@/lib/contracts-bridge";
import { mark, MARK } from "@/lib/instrumentation/perf";
import type { RootStackScreenProps } from "../navigation/types";

// O4 v2 (pre-registration §3): cold TTI = nativeLaunchStart → FIRST interactive
// screen, which is Home. Latch once per process so re-visits never re-mark.
let markedHomeInteractive = false;

/**
 * G1 foundation home. Styled with Uniwind className; copy via i18next (Slice 6).
 */
export function HomeScreen({ navigation }: RootStackScreenProps<"Home">) {
  const { t } = useTranslation();
  const bridge = contractsBridgeSmoke();

  useEffect(() => {
    if (!markedHomeInteractive) {
      markedHomeInteractive = true;
      mark(MARK.screenInteractive);
    }
  }, []);

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-4xl font-extrabold text-foreground">{t("home.title")}</Text>
      <Text className="mb-2 mt-1 text-[15px] text-muted">
        {t("home.subtitle", {
          allowlist: bridge.allowlistSize,
          days: bridge.inactiveThresholdDays,
        })}
      </Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("EquipmentList")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          {t("home.equipment")}
        </Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("Scan")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.scan")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("SignIn")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.signIn")}</Text>
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
          {t("home.realtimeDebug")}
        </Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("G2Measure")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("home.g2Measure")}</Text>
      </Pressable>
    </View>
  );
}
