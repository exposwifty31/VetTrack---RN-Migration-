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
import { useState } from "react";
import Constants from "expo-constants";
import { Linking, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { Uniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";
import { SectionCard } from "@/components/ui/SectionCard";
import { LanguageCard } from "@/features/account/LanguageCard";
import {
  applyThemeChange,
  resolveInitialTheme,
  type ThemeMode,
} from "@/features/account/theme-resolver";
import { usePushPermissionStatus } from "@/infrastructure/push/push-permission-status";

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
        <AppearanceCard />
        <LanguageCard />

        <NotificationsCard />

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

/**
 * Notifications — the OS permission state, and the one repair the OS permits.
 *
 * This is deliberately NOT a preferences panel. The server has the toggles
 * (`PATCH /api/push/subscribe`), but `alertsEnabled` is the flag `sendPushToAll`
 * checks, and `sendPushToAll` is how `code_blue_broadcast` is delivered — so an
 * "alerts" switch here would be a control that silently turns off Code Blue.
 * There is also no GET, so it could not display the server's actual value even
 * if it were safe to offer. Both are recorded for the owner rather than guessed
 * at in a settings row.
 *
 * The permission state, by contrast, is already owned by the app and is the
 * thing that actually goes wrong: one "Don't Allow" used to end in a silent
 * `return` inside PushBridge, and nothing could report it afterwards. Same
 * treatment the camera gets in QrScanner — name the state, route to Settings,
 * and say nothing at all before the OS has been asked.
 */
function NotificationsCard() {
  const { t } = useTranslation();
  const status = usePushPermissionStatus();

  return (
    <SectionCard>
      <Text className="font-rubik text-[12.5px] text-text-tertiary">
        {t("settings.notifications")}
      </Text>
      {status === "denied" ? (
        <>
          <Text className="mt-2 font-rubik text-[15px] text-danger">
            {t("settings.notificationsDeniedBody")}
          </Text>
          <PressableScale
            accessibilityRole="button"
            className="mt-3 min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-4"
            onPress={() => void Linking.openSettings()}
          >
            <Text className="font-rubik-semibold text-[15px] text-foreground">
              {t("settings.openSystemSettings")}
            </Text>
          </PressableScale>
        </>
      ) : (
        <Text className="mt-2 font-rubik text-[15px] text-muted">
          {status === "granted"
            ? t("settings.notificationsGranted")
            : t("settings.notificationsPlaceholder")}
        </Text>
      )}
    </SectionCard>
  );
}

/**
 * Appearance — Light (default) / Dark / System, applied LIVE via Uniwind's
 * global setTheme and persisted through the MMKV port (theme-resolver). No
 * restart hint: unlike the RTL flag, the theme applies this session immediately.
 * "System" follows the OS only once app.json's userInterfaceStyle is "automatic"
 * in the built binary.
 */
function AppearanceCard() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(() => resolveInitialTheme());
  const [persistFailed, setPersistFailed] = useState(false);

  const choose = (next: ThemeMode) => {
    setPersistFailed(false);
    const result = applyThemeChange(next, (m) => Uniwind.setTheme(m));
    setMode(next);
    if (!result.persisted) setPersistFailed(true);
  };

  return (
    <SectionCard>
      <Text className="font-rubik text-[12.5px] text-text-tertiary">{t("settings.appearance")}</Text>
      <View className="mt-2 flex-row gap-2">
        <ThemeOption
          label={t("settings.themeLight")}
          selected={mode === "light"}
          onPress={() => choose("light")}
        />
        <ThemeOption
          label={t("settings.themeDark")}
          selected={mode === "dark"}
          onPress={() => choose("dark")}
        />
        <ThemeOption
          label={t("settings.themeSystem")}
          selected={mode === "system"}
          onPress={() => choose("system")}
        />
      </View>
      {persistFailed ? (
        <Text className="mt-2 font-rubik text-[12.5px] text-danger">{t("settings.themeError")}</Text>
      ) : null}
    </SectionCard>
  );
}

function ThemeOption({
  label,
  selected,
  onPress,
}: Readonly<{ label: string; selected: boolean; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={
        selected
          ? "min-h-[44px] flex-1 items-center justify-center rounded-md border border-primary bg-surface-raised px-2"
          : "min-h-[44px] flex-1 items-center justify-center rounded-md border border-border bg-surface px-2"
      }
      onPress={onPress}
    >
      <Text
        className={
          selected
            ? "font-rubik-semibold text-[14px] text-foreground"
            : "font-rubik-medium text-[14px] text-muted"
        }
      >
        {label}
      </Text>
    </PressableScale>
  );
}
