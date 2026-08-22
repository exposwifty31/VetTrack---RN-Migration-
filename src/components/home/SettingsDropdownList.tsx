/**
 * Quick settings inside the gear dropdown. Theme is the one setting worth a
 * one-tap peek — it applies immediately and is the reason people opened the
 * gear at all; everything else stays behind the footer link to the full page.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Uniwind, useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";

const THEMES = [
  { value: "light", labelKey: "settings.themeLight" },
  { value: "dark", labelKey: "settings.themeDark" },
  { value: "system", labelKey: "settings.themeSystem" },
] as const;

export function SettingsDropdownList() {
  const { t } = useTranslation();
  const { theme } = useUniwind();

  return (
    <View className="py-1">
      <Text className="px-4 pb-1 pt-2 text-[12px] font-semibold text-muted">
        {t("settings.appearance")}
      </Text>
      {THEMES.map((option) => (
        <PressableScale
          key={option.value}
          className="flex-row items-center justify-between px-4 py-3"
          accessibilityRole="button"
          onPress={() => Uniwind.setTheme(option.value)}
        >
          <Text className="text-[15px] text-foreground">{t(option.labelKey)}</Text>
          {theme === option.value ? (
            <Text className="text-[15px] font-bold text-primary">✓</Text>
          ) : null}
        </PressableScale>
      ))}
    </View>
  );
}
