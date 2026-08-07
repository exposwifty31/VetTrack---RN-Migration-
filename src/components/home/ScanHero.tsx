/**
 * Scan hero — THE primary action, never demoted below the fold (README.md §3).
 * Double-bezel violet gradient card; the only fully saturated element on the
 * screen. Identical in both themes. Press = the signature PressableScale feel.
 */
import { I18nManager, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";

// Forward-pointing arrow (README §3: "← arrow (RTL forward)"). Layout direction
// is fixed at boot (rtl-bootstrap), so a module-level constant is safe.
const FORWARD_ARROW = I18nManager.isRTL ? "←" : "→";

export function ScanHero({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="px-[22px] pt-3">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("aurora.scanTitle")}
        onPress={onPress}
        className="rounded-[30px] border border-[rgba(139,92,246,0.38)] bg-[rgba(124,58,237,0.14)] p-1.5 light:border-[rgba(109,40,217,0.20)] light:bg-[rgba(109,40,217,0.07)]"
      >
        <View
          className="flex-row items-center gap-3.5 rounded-[24px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-[18px]"
          style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
        >
          <View className="h-[50px] w-[50px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.18)]">
            <View className="h-[21px] w-[21px] items-center justify-center rounded-full border-2 border-white">
              <View className="h-[7px] w-[7px] rounded-full bg-white" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="font-rubik-bold text-[19px] text-white">{t("aurora.scanTitle")}</Text>
            {/* AA (4.5:1 @12.5px): solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
            <Text className="mt-[1px] font-rubik text-[12.5px] text-white">
              {t("aurora.scanSubtitle")}
            </Text>
          </View>
          <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.16)]">
            <Text className="text-[17px] text-white">{FORWARD_ARROW}</Text>
          </View>
        </View>
      </PressableScale>
    </View>
  );
}
