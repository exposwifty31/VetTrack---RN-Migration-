/**
 * Settings — the real preferences screen behind the home gear (the gear used to
 * open Menu, a false duplicate of the Menu tab). A param-free root-stack route
 * (Slice-1 nav contract: no transparentModal / BottomSheet). Opaque Aurora
 * `SectionCard`s only, zero blur layers — the home GlassTopBar stays the sole
 * blur surface.
 *
 * Sections: Appearance (theme — added in the theme wave), Language (the shared
 * single locale toggle), Notifications (placeholder until a preferences surface
 * exists), and About (app version + Privacy Policy — a store requirement). The
 * destructive account actions (name, sign-out, delete) deliberately stay in the
 * Menu's AccountSection, not here.
 */
import Constants from "expo-constants";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";

import { PressableScale } from "@/components/PressableScale";
import { SectionCard } from "@/components/ui/SectionCard";
import { LanguageCard } from "@/features/account/LanguageCard";

/** Store-required policy page (from the shared app metadata; opened in-app). */
const PRIVACY_POLICY_URL = "https://vettrack.uk/privacy";

export function SettingsScreen() {
  const { t } = useTranslation();
  // expoConfig carries app.json's `expo.version` in the prebuilt binary; fall
  // back to an em dash rather than fabricate a version if it is unavailable.
  const version = Constants.expoConfig?.version ?? "—";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
    >
      <View className="gap-4 px-[22px]">
        {/* Appearance (theme mode) is added by the theme wave — kept first. */}
        <LanguageCard />

        <SectionCard>
          <Text className="font-rubik text-[12.5px] text-text-tertiary">
            {t("settings.notifications")}
          </Text>
          <Text className="mt-2 font-rubik text-[15px] text-muted">
            {t("settings.notificationsPlaceholder")}
          </Text>
        </SectionCard>

        <SectionCard>
          <Text className="font-rubik text-[12.5px] text-text-tertiary">{t("settings.about")}</Text>
          <PressableScale
            accessibilityRole="link"
            className="mt-2 min-h-[44px] flex-row items-center"
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
          >
            <Text className="font-rubik-medium text-[16px] text-foreground">
              {t("settings.privacyPolicy")}
            </Text>
          </PressableScale>
          <Text className="mt-1 font-rubik text-[12.5px] text-text-tertiary" selectable>
            {t("settings.version", { version })}
          </Text>
        </SectionCard>
      </View>
    </ScrollView>
  );
}
