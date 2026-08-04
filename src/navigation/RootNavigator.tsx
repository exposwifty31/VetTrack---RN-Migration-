import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { ApiSmokeScreen } from "../screens/ApiSmokeScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { I18nDebugScreen } from "../screens/I18nDebugScreen";
import { NfcSpikeScreen } from "../screens/NfcSpikeScreen";
import { RealtimeDebugScreen } from "../screens/RealtimeDebugScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { StorageDebugScreen } from "../screens/StorageDebugScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Native-stack root navigator (screens 4.x + native-stack 7.x, New Arch). */
export function RootNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#0f172a" },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: t("nav.home") }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: t("nav.signIn") }} />
      <Stack.Screen name="ApiSmoke" component={ApiSmokeScreen} options={{ title: t("nav.apiSmoke") }} />
      <Stack.Screen name="NfcSpike" component={NfcSpikeScreen} options={{ title: t("nav.nfcSpike") }} />
      <Stack.Screen name="StorageDebug" component={StorageDebugScreen} options={{ title: t("nav.storageDebug") }} />
      <Stack.Screen name="RealtimeDebug" component={RealtimeDebugScreen} options={{ title: t("nav.realtimeDebug") }} />
      <Stack.Screen name="I18nDebug" component={I18nDebugScreen} options={{ title: t("nav.i18nDebug") }} />
    </Stack.Navigator>
  );
}
