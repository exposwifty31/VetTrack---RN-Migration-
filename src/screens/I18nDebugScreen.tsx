import { useState } from "react";
import { I18nManager, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  applyRtlDirection,
  isRtlReloadPending,
  persistLocale,
  type Locale,
} from "@/i18n";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * G1 Slice-6 i18n + RTL smoke screen. Toggling language changes copy live
 * (react-i18next re-render), but layout direction only flips after a JS reload
 * when the desired direction changes — the pending banner makes that explicit.
 */
export function I18nDebugScreen(_props: RootStackScreenProps<"I18nDebug">) {
  const { t, i18n } = useTranslation();
  const [, force] = useState(0);
  const active = (i18n.language === "en" ? "en" : "he") as Locale;
  const pending = isRtlReloadPending(active);

  const toggle = async () => {
    const next: Locale = active === "he" ? "en" : "he";
    await i18n.changeLanguage(next); // copy flips live
    persistLocale(next); // remember the choice
    applyRtlDirection(next); // native flag; layout flips on next reload
    force((n) => n + 1); // re-render pending indicator
  };

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">{t("i18nDebug.title")}</Text>
      <Text className="text-[14px] text-muted">
        {t("i18nDebug.localeLabel", { locale: active })}
      </Text>
      <Text className="text-[14px] text-muted">
        {t("i18nDebug.directionLabel", { isRtl: String(I18nManager.isRTL) })}
      </Text>
      <Text className="text-[14px] text-muted">
        {t("i18nDebug.desiredLabel", { desired: String(active === "he") })}
      </Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => {
          void toggle();
        }}
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          {t("i18nDebug.toggle")}
        </Text>
      </Pressable>

      <Text className={pending ? "text-[14px] text-danger" : "text-[14px] text-info"}>
        {pending ? t("i18nDebug.reloadPending") : t("i18nDebug.reloadNotPending")}
      </Text>

      <Text className="mt-2 text-[14px] text-foreground">
        {t("i18nDebug.sample", {
          save: t("common.save"),
          cancel: t("common.cancel"),
          loading: t("common.loading"),
        })}
      </Text>
    </View>
  );
}
