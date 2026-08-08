/**
 * Account essentials (G3 Slice 12) — the thin "daily driver needs these" subset
 * that ships in the Menu front door (G3-PLAN §1 Grade-C carve-out): display-name
 * edit, locale toggle, sign out. No avatar, no full profile, no settings — those
 * stay Grade-C/G5.
 *
 * Aurora: opaque `SectionCard`s only, zero blur layers (the display-name edit is
 * an INLINE field, not a sheet — the frozen nav contract forbids registering the
 * `transparentModal` route `BottomSheet` needs, and inline keeps the Menu at
 * ≤1 blur trivially). Press feedback via `PressableScale`. RTL-correct: RN
 * auto-mirrors `flex-row`; the Latin-capable display name renders inside an FSI
 * isolate.
 */
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PressableScale } from "@/components/PressableScale";
import { SectionCard } from "@/components/ui/SectionCard";
import { IDENTITY_QUERY_KEY, useIdentity } from "@/app/useIdentity";
import {
  accountApi,
  DISPLAY_NAME_MAX_LENGTH,
  isValidDisplayName,
} from "@/lib/api/account";
import { applyLocaleChange } from "@/features/account/locale-toggle";
import {
  getAuthSession,
  isAuthSessionActive,
  subscribeAuthSession,
} from "@/infrastructure/auth/authSession";
import { type Locale } from "@/i18n/locale-resolver";
import { isRtlReloadPending } from "@/i18n/rtl";
import { AURORA_COLORS } from "@/theme/colors";

/** FSI…PDI isolate so a Latin display name sits correctly in an RTL row. */
function isolate(value: string): string {
  return `⁨${value}⁩`;
}

export function AccountSection({ onSignedOut }: Readonly<{ onSignedOut: () => void }>) {
  // Reactive session availability — re-renders when ClerkTokenBridge's effect
  // registers/clears sign-out (a plain module read would miss that transition).
  const sessionActive = useSyncExternalStore(
    subscribeAuthSession,
    isAuthSessionActive,
    isAuthSessionActive,
  );
  return (
    <View className="gap-3">
      <DisplayNameCard />
      <LanguageCard />
      {/* Sign-out is offered only when an interactive session exists (hidden in
          dev-bypass). The port adapter — not this component — knows about Clerk. */}
      {sessionActive ? <SignOutCard onSignedOut={onSignedOut} /> : null}
    </View>
  );
}

function DisplayNameCard() {
  const { t } = useTranslation();
  const identity = useIdentity();
  const queryClient = useQueryClient();

  const userId = identity.data?.id;
  const currentName = identity.data?.displayName ?? identity.data?.name ?? "";

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const mutation = useMutation({
    mutationFn: (name: string) => {
      if (!userId) throw new Error("identity-unresolved");
      return accountApi.updateDisplayName(userId, name);
    },
    onSuccess: () => {
      // Invalidate-not-optimistic: the identity query is the source of truth for
      // the name; refetch keeps the Menu and every other consumer consistent.
      void queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
      setEditing(false);
    },
  });

  const trimmed = value.trim();
  const canSave =
    !!userId && isValidDisplayName(value) && trimmed !== currentName.trim() && !mutation.isPending;

  if (!editing) {
    return (
      <SectionCard>
        <Text className="font-rubik text-[12.5px] text-text-tertiary">
          {t("account.displayName")}
        </Text>
        <View className="mt-1 flex-row items-center justify-between gap-3">
          <Text
            className={currentName ? "font-rubik-medium text-[16px] text-foreground" : "font-rubik text-[16px] text-muted"}
            numberOfLines={1}
          >
            {currentName ? isolate(currentName) : t("account.displayNamePlaceholder")}
          </Text>
          <PressableScale
            accessibilityRole="button"
            disabled={!userId}
            className="min-h-[36px] justify-center rounded-md border border-border bg-surface px-4"
            onPress={() => {
              setValue(currentName);
              mutation.reset();
              setEditing(true);
            }}
          >
            <Text className={userId ? "font-rubik-semibold text-[14px] text-foreground" : "font-rubik-semibold text-[14px] text-muted"}>
              {t("account.edit")}
            </Text>
          </PressableScale>
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <Text className="font-rubik text-[12.5px] text-text-tertiary">
        {t("account.displayName")}
      </Text>
      <TextInput
        className="mt-2 min-h-[44px] rounded-md border border-border bg-background px-3 py-2.5 font-rubik text-[16px] text-foreground"
        value={value}
        onChangeText={setValue}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        autoFocus
        placeholder={t("account.displayNamePlaceholder")}
        placeholderTextColor={AURORA_COLORS.muted}
        editable={!mutation.isPending}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (canSave) mutation.mutate(value);
        }}
      />
      {value.length > 0 && !isValidDisplayName(value) ? (
        <Text className="mt-1.5 font-rubik text-[12.5px] text-danger">
          {t("account.displayNameInvalid")}
        </Text>
      ) : null}
      {mutation.isError ? (
        <Text className="mt-1.5 font-rubik text-[12.5px] text-danger">
          {t("account.updateError")}
        </Text>
      ) : null}
      <View className="mt-3 flex-row items-center justify-end gap-2">
        <PressableScale
          accessibilityRole="button"
          disabled={mutation.isPending}
          className="min-h-[44px] justify-center rounded-md border border-border bg-surface px-5"
          onPress={() => setEditing(false)}
        >
          <Text className="font-rubik-semibold text-[15px] text-foreground">{t("common.cancel")}</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          disabled={!canSave}
          className={
            canSave
              ? "min-h-[44px] justify-center rounded-md bg-primary px-6"
              : "min-h-[44px] justify-center rounded-md border border-border bg-surface px-6"
          }
          onPress={() => mutation.mutate(value)}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={AURORA_COLORS.foreground} />
          ) : (
            <Text
              className={
                canSave
                  ? "font-rubik-semibold text-[15px] text-primary-foreground"
                  : "font-rubik-semibold text-[15px] text-muted"
              }
            >
              {t("account.save")}
            </Text>
          )}
        </PressableScale>
      </View>
    </SectionCard>
  );
}

function LanguageCard() {
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

function SignOutCard({ onSignedOut }: Readonly<{ onSignedOut: () => void }>) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // Through the AuthSessionPort — never Clerk directly (hexagonal boundary).
      await getAuthSession().signOut();
      onSignedOut();
    } catch {
      // A failed sign-out leaves the session intact; re-enable the button so the
      // user can retry. No copy leak — the button simply becomes pressable again.
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    Alert.alert(t("account.signOutConfirmTitle"), t("account.signOutConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("account.signOut"), style: "destructive", onPress: () => void run() },
    ]);
  };

  return (
    <PressableScale
      accessibilityRole="button"
      disabled={busy}
      className="min-h-[48px] flex-row items-center justify-center rounded-md border border-danger bg-surface px-4"
      onPress={confirm}
    >
      {busy ? (
        <ActivityIndicator color={AURORA_COLORS.danger} />
      ) : (
        <Text className="font-rubik-semibold text-[15px] text-danger">{t("account.signOut")}</Text>
      )}
    </PressableScale>
  );
}
