/**
 * תפריט — the Menu front door (G3 Slice 12). Restructured from the G1
 * debug-launcher into a real daily-driver menu with four grouped sections:
 *   • Operations — the daily-driver surfaces (Tasks, Rooms, Mine, Alerts,
 *     Inventory, Autopilot), each a param-free `navigation.navigate`.
 *   • Session — End shift → Handoff.
 *   • Account — display-name edit, locale toggle, sign out (AccountSection).
 *   • Developer — every debug screen from the old Menu, preserved under a
 *     collapsible section (default-collapsed to keep the front door clean, but
 *     ALWAYS rendered so nothing is lost — critically, G2Measure stays reachable
 *     on a `__DEV__ === false` release build, which the G3 exit-pass depends on).
 *
 * The route map is compile-checked in `menu/menu-routes.ts` (every entry is a
 * param-free root-stack route). Aurora: opaque grouped `SectionCard`s, zero blur
 * layers, `PressableScale` rows; RN auto-mirrors the row layout in RTL.
 */
import { Fragment } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/PressableScale";
import { AccountSection } from "@/features/account/AccountSection";
import { useIdentity } from "@/app/useIdentity";
import { useAppStore } from "@/store/useAppStore";
import type { MainTabScreenProps } from "@/navigation/types";
import {
  DEVELOPER_ENTRIES,
  SESSION_ENTRIES,
  visibleOperationsEntries,
  type MenuEntry,
} from "./menu/menu-routes";

export function MenuScreen({ navigation }: MainTabScreenProps<"Menu">) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const identity = useIdentity();

  // Custody-scoped roles (students and viewers) already get "Mine" as a bottom
  // TAB (Slice 4), so the Menu omits the duplicate; unrestricted roles and an
  // unresolved role reach Mine here.
  const operations = visibleOperationsEntries(identity.data?.effectiveRole);

  const go = (entry: MenuEntry) => navigation.navigate(entry.route);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      <View className="gap-7 px-[22px]">
        <Text className="font-rubik-bold text-[26px] text-foreground">{t("menu.title")}</Text>

        <MenuGroup title={t("menu.sections.operations")} entries={operations} onSelect={go} />
        <MenuGroup title={t("menu.sections.session")} entries={SESSION_ENTRIES} onSelect={go} />

        <View className="gap-3">
          <GroupLabel title={t("menu.sections.account")} />
          <AccountSection onSignedOut={() => navigation.navigate("SignIn")} />
        </View>

        <DeveloperGroup onSelect={go} />
      </View>
    </ScrollView>
  );
}

/**
 * Developer tools — collapsed by default (kept out of the daily-driver's way) but
 * ALWAYS rendered so every debug screen stays reachable, including on a release
 * build where `__DEV__` is false. G2Measure has no other UI entry point and the
 * exit-pass runs it on the release artifact, so it must not be `__DEV__`-gated.
 */
function DeveloperGroup({ onSelect }: Readonly<{ onSelect: (entry: MenuEntry) => void }>) {
  const { t } = useTranslation();
  // Client UI state lives in the Zustand app store, not local component state.
  const expanded = useAppStore((state) => state.developerMenuExpanded);
  const toggle = useAppStore((state) => state.toggleDeveloperMenu);
  return (
    <View className="gap-3">
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="min-h-[36px] flex-row items-center justify-between"
        onPress={toggle}
      >
        <GroupLabel title={t("menu.sections.developer")} />
        <Text className="font-rubik-semibold text-[12.5px] text-text-tertiary">
          {expanded ? t("menu.hide") : t("menu.show")}
        </Text>
      </PressableScale>
      {expanded ? (
        <View className="overflow-hidden rounded-md border border-border bg-surface">
          {DEVELOPER_ENTRIES.map((entry, index) => (
            <Fragment key={entry.route}>
              {index > 0 ? <View className="h-px bg-border" /> : null}
              <MenuRow label={t(entry.labelKey)} onPress={() => onSelect(entry)} />
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GroupLabel({ title }: Readonly<{ title: string }>) {
  return (
    <Text className="font-rubik-semibold text-[12.5px] uppercase tracking-wide text-text-tertiary">
      {title}
    </Text>
  );
}

/** A titled group: a section label above an opaque card of hairline-divided rows. */
function MenuGroup({
  title,
  entries,
  onSelect,
}: Readonly<{ title: string; entries: readonly MenuEntry[]; onSelect: (entry: MenuEntry) => void }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <GroupLabel title={title} />
      <View className="overflow-hidden rounded-md border border-border bg-surface">
        {entries.map((entry, index) => (
          <Fragment key={entry.route}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            <MenuRow label={t(entry.labelKey)} onPress={() => onSelect(entry)} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function MenuRow({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      className="min-h-[52px] flex-row items-center justify-between px-4 py-3"
      onPress={onPress}
    >
      <Text className="font-rubik-medium text-[16px] text-foreground">{label}</Text>
    </PressableScale>
  );
}
