/**
 * Floating glass top bar — alternative A ("אי זכוכית צף"), the ONE blur layer
 * on the home screen (blur budget: T1, 22px-equivalent). Content scrolls under
 * it. RTL-first: the logo cluster leads (renders on the right), the avatar
 * trails. The vt-mark is the ORIGINAL asset embedded as-is in a glass bezel.
 */
import { StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import { SvgXml } from "react-native-svg";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";

import { BellIcon, SearchIcon, SlidersIcon } from "./icons";
import { VT_MARK_XML } from "./vt-mark-xml";

/** Visual bar height (44pt row + vertical padding) for scroll-under offsets. */
export const TOP_BAR_HEIGHT = 52;

type GlassTopBarProps = {
  topInset: number;
  /** Avatar initial (from the signed-in identity). Hidden letter when unknown. */
  initial?: string;
  /**
   * G2.5 data seam: no notifications API exists yet — callers pass undefined
   * and the badge stays hidden. Never fabricate a count.
   */
  unreadCount?: number;
  onSearchPress: () => void;
  onSettingsPress: () => void;
};

export function GlassTopBar({
  topInset,
  initial,
  unreadCount,
  onSearchPress,
  onSettingsPress,
}: GlassTopBarProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const fg = light ? "#171331" : "#F3F1FA";
  const badgeText = unreadCount != null && unreadCount > 9 ? "9+" : String(unreadCount ?? 0);

  return (
    <View
      style={{
        position: "absolute",
        top: topInset + 4,
        left: 12,
        right: 12,
        boxShadow: light ? "0 8px 22px rgba(23,19,49,0.07)" : undefined,
      }}
      className="overflow-hidden rounded-full border border-[rgba(167,139,250,0.20)] light:border-border"
    >
      <BlurView intensity={40} tint={light ? "light" : "dark"} style={StyleSheet.absoluteFill} />
      <View
        className="flex-row items-center bg-glass py-1 pe-1.5 ps-2.5"
        style={{ boxShadow: light ? undefined : "inset 0 1px 1px rgba(255,255,255,0.10)" }}
      >
        <View className="flex-1 flex-row items-center gap-2">
          <View
            className="rounded-[10px] bg-[rgba(167,139,250,0.20)] p-0.5 light:bg-[rgba(109,40,217,0.12)]"
            style={{
              boxShadow: light
                ? "0 4px 12px rgba(109,40,217,0.22)"
                : "0 0 14px rgba(139,92,246,0.40)",
            }}
          >
            <View className="overflow-hidden rounded-[8px]">
              <SvgXml xml={VT_MARK_XML} width={28} height={28} />
            </View>
          </View>
          <Text
            className="font-rubik-bold text-[16px]"
            style={{ writingDirection: "ltr" }}
            accessibilityLabel="VetTrack"
          >
            <Text className="text-foreground">Vet</Text>
            <Text className="text-[#A78BFA] light:text-[#6D28D9]">Track</Text>
          </Text>
        </View>

        <PressableScale
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t("aurora.searchA11y")}
          onPress={onSearchPress}
        >
          <SearchIcon color={fg} />
        </PressableScale>

        {/* G2.5 data seam: bell is a no-op until a notifications surface exists. */}
        <View className="h-11 w-11 items-center justify-center">
          <BellIcon color={fg} />
          {unreadCount != null && unreadCount > 0 ? (
            <View
              className="absolute end-[3px] top-[3px] h-4 min-w-[17px] items-center justify-center rounded-full bg-danger-solid px-1"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }}
            >
              <Text
                className="font-rubik-bold text-[10px] leading-none text-white"
                style={{ writingDirection: "ltr" }}
              >
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>

        <PressableScale
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t("aurora.settingsA11y")}
          onPress={onSettingsPress}
        >
          <SlidersIcon color={fg} />
        </PressableScale>

        <View className="h-11 w-11 items-center justify-center">
          <View className="h-8 w-8 items-center justify-center rounded-full border-2 border-[rgba(243,241,250,0.25)] bg-gradient-to-b from-[#8B5CF6] to-[#6D28D9] light:border-[rgba(109,40,217,0.20)]">
            {initial ? (
              <Text className="font-rubik-bold text-[13px] text-white" style={{ writingDirection: "ltr" }}>
                {initial}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
