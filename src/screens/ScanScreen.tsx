import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useNfcAdvisoryScan } from "@/hooks/useNfcAdvisoryScan";

import type { RootStackScreenProps } from "../navigation/types";

/**
 * Foreground NFC read → advisory pre-fill. The read PRE-FILLS the confirm sheet; it
 * never commits custody (ADR-006). On a successful decode we navigate to ScanConfirm
 * with the extracted id; a human confirms there.
 */
export function ScanScreen({ navigation }: RootStackScreenProps<"Scan">) {
  const { t } = useTranslation();
  const { supported, reading, scan } = useNfcAdvisoryScan();
  const [note, setNote] = useState<string | null>(null);

  const onScan = async () => {
    setNote(null);
    const result = await scan();
    if (result.status === "ok") {
      navigation.navigate("ScanConfirm", { equipmentId: result.equipmentId });
      return;
    }
    setNote(result.status === "read_failed" ? t("scan.readFailed") : t("scan.noId"));
  };

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-center text-[16px] text-foreground">
        {reading ? t("scan.readReady") : t("scan.prompt")}
      </Text>

      {supported === false ? (
        <Text className="text-center text-[14px] text-danger">{t("scan.unsupported")}</Text>
      ) : null}

      <Pressable
        className="items-center rounded-xl bg-primary px-6 py-3.5 active:opacity-80"
        accessibilityRole="button"
        disabled={reading || supported === false}
        onPress={() => {
          void onScan();
        }}
      >
        {reading ? (
          <ActivityIndicator color="#f8fafc" />
        ) : (
          <Text className="text-[15px] font-semibold text-primary-foreground">
            {t("scan.start")}
          </Text>
        )}
      </Pressable>

      {note ? <Text className="text-center text-[14px] text-muted">{note}</Text> : null}
    </View>
  );
}
