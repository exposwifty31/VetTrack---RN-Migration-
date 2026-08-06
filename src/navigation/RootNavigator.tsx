import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { BootstrapGate } from "../app/BootstrapGate";
import { ApiSmokeScreen } from "../screens/ApiSmokeScreen";
import { CheckoutConfirm } from "../screens/CheckoutConfirm";
import { EquipmentListScreen } from "../screens/EquipmentListScreen";
import { G2MeasureScreen } from "../screens/G2MeasureScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { I18nDebugScreen } from "../screens/I18nDebugScreen";
import { NfcSpikeScreen } from "../screens/NfcSpikeScreen";
import { RealtimeDebugScreen } from "../screens/RealtimeDebugScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { StorageDebugScreen } from "../screens/StorageDebugScreen";
import type { RootStackParamList, RootStackScreenProps } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

// The scan path must not mount before identity resolves: `ScanScreen` starts
// `useNfcAdvisoryScan` (NfcManager.isSupported/start) on mount, and `ScanConfirm`
// hits the custody endpoint. Gate BOTH behind `BootstrapGate` — module-level
// wrappers (no route group exists) so they aren't redefined every render.
function GatedScan(props: RootStackScreenProps<"Scan">) {
  return (
    <BootstrapGate>
      <ScanScreen {...props} />
    </BootstrapGate>
  );
}

function GatedScanConfirm(props: RootStackScreenProps<"ScanConfirm">) {
  return (
    <BootstrapGate>
      <CheckoutConfirm {...props} />
    </BootstrapGate>
  );
}

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
      <Stack.Screen
        name="EquipmentList"
        component={EquipmentListScreen}
        options={{ title: t("nav.equipment") }}
      />
      <Stack.Screen name="Scan" component={GatedScan} options={{ title: t("nav.scan") }} />
      <Stack.Screen
        name="ScanConfirm"
        component={GatedScanConfirm}
        options={{ presentation: "transparentModal", headerShown: false }}
      />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: t("nav.signIn") }} />
      <Stack.Screen name="ApiSmoke" component={ApiSmokeScreen} options={{ title: t("nav.apiSmoke") }} />
      <Stack.Screen name="NfcSpike" component={NfcSpikeScreen} options={{ title: t("nav.nfcSpike") }} />
      <Stack.Screen name="StorageDebug" component={StorageDebugScreen} options={{ title: t("nav.storageDebug") }} />
      <Stack.Screen name="RealtimeDebug" component={RealtimeDebugScreen} options={{ title: t("nav.realtimeDebug") }} />
      <Stack.Screen name="I18nDebug" component={I18nDebugScreen} options={{ title: t("nav.i18nDebug") }} />
      <Stack.Screen name="G2Measure" component={G2MeasureScreen} options={{ title: t("nav.g2Measure") }} />
    </Stack.Navigator>
  );
}
