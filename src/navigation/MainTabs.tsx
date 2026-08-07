/**
 * G2.5 Aurora bottom tabs (README.md §7). The tab bar is deliberately OPAQUE
 * (`--color-surface-raised` + top hairline): the חירום tab sits here and Code
 * Blue doctrine forbids glass on anything emergency-related — including the
 * tab's icon and active state (active = SOLID danger fill, white content,
 * never a tint). Tabs use static pressed styles, not scale animation: the
 * emergency tab must never animate, and the bar stays uniform.
 */
import type { ReactNode } from "react";
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { EmergencyScreen } from "@/screens/EmergencyScreen";
import { EquipmentListScreen } from "@/screens/EquipmentListScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { MenuScreen } from "@/screens/MenuScreen";

import type { MainTabParamList, MainTabScreenProps, RootStackScreenProps } from "./types";
import { EmergencyGlyph, EquipmentGlyph, MenuGlyph, TodayGlyph } from "@/components/home/icons";

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * EquipmentListScreen predates the tab layer and is typed against the root
 * stack (it is ALSO still registered there for the NFC advisory fallback).
 * The runtime navigation object of a nested tab reaches the same root stack
 * routes, so the cast is behavior-preserving.
 */
function EquipmentTabScreen(props: MainTabScreenProps<"EquipmentTab">) {
  return (
    <EquipmentListScreen {...(props as unknown as RootStackScreenProps<"EquipmentList">)} />
  );
}

type TabVisual = {
  labelKey: "tabs.today" | "tabs.equipment" | "tabs.emergency" | "tabs.menu";
  glyph: (color: string) => ReactNode;
};

const TAB_VISUALS: Record<keyof MainTabParamList, TabVisual> = {
  Today: { labelKey: "tabs.today", glyph: (c) => <TodayGlyph color={c} /> },
  EquipmentTab: { labelKey: "tabs.equipment", glyph: (c) => <EquipmentGlyph color={c} /> },
  Emergency: { labelKey: "tabs.emergency", glyph: (c) => <EmergencyGlyph color={c} /> },
  Menu: { labelKey: "tabs.menu", glyph: (c) => <MenuGlyph color={c} /> },
};

function AuroraTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const light = theme === "light";

  const inactiveColor = light ? "#5B5680" : "#A6A0C3";
  const violet = light ? "#6D28D9" : "#A78BFA";
  const violetPillBg = light ? "rgba(109,40,217,0.10)" : "rgba(167,139,250,0.16)";
  const dangerColor = light ? "#B91C1C" : "#F87171";
  const dangerSolid = light ? "#B91C1C" : "#DC2626";

  return (
    <View
      className="flex-row border-t border-[rgba(167,139,250,0.16)] bg-surface-raised px-1.5 pt-2 light:border-border"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const visual = TAB_VISUALS[route.name as keyof MainTabParamList];
        const isEmergency = route.name === "Emergency";

        let color: string;
        if (isEmergency) {
          color = focused ? "#FFFFFF" : dangerColor;
        } else {
          color = focused ? violet : inactiveColor;
        }
        const labelColor = isEmergency ? dangerColor : focused ? violet : inactiveColor;

        const pillStyle = focused
          ? { backgroundColor: isEmergency ? dangerSolid : violetPillBg }
          : undefined;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={t(visual.labelKey)}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            className="min-h-[44px] flex-1 items-center justify-center gap-1 active:opacity-80"
          >
            <View
              className="h-7 w-12 items-center justify-center rounded-full"
              style={pillStyle}
            >
              {visual.glyph(color)}
            </View>
            <Text
              className={`text-[11px] ${focused || isEmergency ? "font-rubik-semibold" : "font-rubik"}`}
              style={{ color: labelColor }}
            >
              {t(visual.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AuroraTabBar {...props} />}
    >
      <Tab.Screen name="Today" component={HomeScreen} />
      <Tab.Screen name="EquipmentTab" component={EquipmentTabScreen} />
      <Tab.Screen name="Emergency" component={EmergencyScreen} />
      <Tab.Screen name="Menu" component={MenuScreen} />
    </Tab.Navigator>
  );
}
