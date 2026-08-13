/**
 * Language toggle card (G3 Slice 12, extracted in the Settings wave). The he⇄en
 * switch shared by the Settings screen — the ONE locale toggle in the app, built
 * on the shared `locale-toggle` logic (no duplicated persistence/RTL handling).
 *
 * Copy flips live via react-i18next; layout DIRECTION only applies on the next
 * launch (see `locale-toggle.ts`), so a truthful "restart to apply" hint is
 * surfaced from the change RESULT — never a faked live direction flip. A failed
 * persist is surfaced loudly (account.localeError) and leaves the native RTL
 * flag untouched.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { SectionCard } from "@/components/ui/SectionCard";
import { applyLocaleChange } from "@/features/account/locale-toggle";
import { type Locale } from "@/i18n/locale-resolver";
import { isRtlReloadPending } from "@/i18n/rtl";

export function LanguageCard() {
  const { t, i18n } = useTranslation();
  const active: Locale = i18n.language === "en" ? "en" : "he";
  // Seeded from the current direction; updated from the change RESULT so the
  // returned `reloadPending` (and a failed persist) are consumed, not recomputed.
  const [reloadPending, setReloadPending] = useState(() => isRtlReloadPending(active));
  const [persistFailed, setPersistFailed] = useState(false);

  const choose = async (locale: Locale) => {
    // After a failed persist, i18next already shows `locale`, so `active` equals
    // it — allow the same-locale press through so the user can retry the write.
    if (locale === active && !persistFailed) return;
    setPersistFailed(false);
    try {
      const result = await applyLocaleChange(i18n, locale);
      setReloadPending(result.reloadPending);
      if (!result.persisted) setPersistFailed(true);
    } catch {
      setPersistFailed(true);
    }
  };

  return (
    <SectionCard>
      <Text className="font-rubik text-[12.5px] text-text-tertiary">{t("account.language")}</Text>
      <View className="mt-2 flex-row gap-2">
        <LocaleOption
          label={t("common.hebrew")}
          selected={active === "he"}
          onPress={() => void choose("he")}
        />
        <LocaleOption
          label={t("common.english")}
          selected={active === "en"}
          onPress={() => void choose("en")}
        />
      </View>
      {persistFailed ? (
        <Text className="mt-2 font-rubik text-[12.5px] text-danger">{t("account.localeError")}</Text>
      ) : reloadPending ? (
        <Text className="mt-2 font-rubik text-[12.5px] text-warning">{t("account.restartHint")}</Text>
      ) : null}
    </SectionCard>
  );
}

function LocaleOption({
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
          ? "min-h-[44px] flex-1 items-center justify-center rounded-md border border-primary bg-surface-raised px-4"
          : "min-h-[44px] flex-1 items-center justify-center rounded-md border border-border bg-surface px-4"
      }
      onPress={onPress}
    >
      <Text
        className={
          selected
            ? "font-rubik-semibold text-[15px] text-foreground"
            : "font-rubik-medium text-[15px] text-muted"
        }
      >
        {label}
      </Text>
    </PressableScale>
  );
}
