import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { BootstrapGate } from "../app/BootstrapGate";
import { AlertsScreen } from "../screens/AlertsScreen";
import { ApiSmokeScreen } from "../screens/ApiSmokeScreen";
import { AutopilotQueueScreen } from "../screens/AutopilotQueueScreen";
import { CheckoutConfirm } from "../screens/CheckoutConfirm";
import { EquipmentDetailScreen } from "../screens/EquipmentDetailScreen";
import { EquipmentListScreen } from "../screens/EquipmentListScreen";
import { G2MeasureScreen } from "../screens/G2MeasureScreen";
import { HandoffScreen } from "../screens/HandoffScreen";
import { I18nDebugScreen } from "../screens/I18nDebugScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { MyEquipmentScreen } from "../screens/MyEquipmentScreen";
import { NfcSpikeScreen } from "../screens/NfcSpikeScreen";
import { RealtimeDebugScreen } from "../screens/RealtimeDebugScreen";
import { RoomDetailScreen } from "../screens/RoomDetailScreen";
import { RoomsScreen } from "../screens/RoomsScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { ShiftChatScreen } from "../screens/ShiftChatScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { AuthLoadingScreen } from "../screens/AuthLoadingScreen";
import { StorageDebugScreen } from "../screens/StorageDebugScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { MainTabs } from "./MainTabs";
import { resolveRootStackView } from "@/app/root-stack-view";
import { resolveClerkPublishableKey } from "@/infrastructure/auth/AuthRoot";
import {
  getClerkAuthState,
  subscribeClerkAuthState,
} from "@/infrastructure/auth/clerk-auth-state";
import type { RootStackParamList, RootStackScreenProps } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Measurement builds (the G3 exit-pass) opt G2Measure back in via this env — the
// eas.json `measure` profile sets it, and only that profile does. A store build
// declares it "false", so G2Measure is neither registered nor listed there. The
// comparison is STRICT against "true" on purpose: "false" is a truthy string, so
// any loose test would ship the measurement screen to users.
const MEASURE_ENABLED = process.env.EXPO_PUBLIC_ENABLE_MEASURE === "true";

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

// G3 placeholders gated the same way — identity must resolve before any G3
// surface renders. Placeholder screens are prop-free (zero data fetching);
// each slice threads its screen props through when it lands (Slice 2 below).
function GatedEquipmentDetail(props: RootStackScreenProps<"EquipmentDetail">) {
  return (
    <BootstrapGate>
      <EquipmentDetailScreen {...props} />
    </BootstrapGate>
  );
}

function GatedTasks() {
  return (
    <BootstrapGate>
      <TasksScreen />
    </BootstrapGate>
  );
}

function GatedAlerts() {
  return (
    <BootstrapGate>
      <AlertsScreen />
    </BootstrapGate>
  );
}

function GatedRooms(props: RootStackScreenProps<"Rooms">) {
  return (
    <BootstrapGate>
      <RoomsScreen {...props} />
    </BootstrapGate>
  );
}

function GatedRoomDetail(props: RootStackScreenProps<"RoomDetail">) {
  return (
    <BootstrapGate>
      <RoomDetailScreen {...props} />
    </BootstrapGate>
  );
}

function GatedShiftChat() {
  return (
    <BootstrapGate>
      <ShiftChatScreen />
    </BootstrapGate>
  );
}

function GatedHandoff() {
  return (
    <BootstrapGate>
      <HandoffScreen />
    </BootstrapGate>
  );
}

function GatedInventory() {
  return (
    <BootstrapGate>
      <InventoryScreen />
    </BootstrapGate>
  );
}

function GatedAutopilotQueue() {
  return (
    <BootstrapGate>
      <AutopilotQueueScreen />
    </BootstrapGate>
  );
}

/**
 * Native-stack root navigator (screens 4.x + native-stack 7.x, New Arch).
 * G2.5 Aurora: `Main` (the tab shell) replaces the old flat Home; every other
 * flow stays a stack route above the tabs. Chrome colors follow the Aurora
 * dark tokens (`--color-background` / `--color-foreground`).
 *
 * AUTH IS A CONDITIONAL STACK, not a screen you push. Previously `Main` was
 * unconditionally the first route and `SignIn` sat above it, so a signed-out
 * cold start mounted the tab shell and let each tab's BootstrapGate paint a
 * re-auth wall INSIDE it — tab bar drawn around a red error, on an install that
 * never had a session. Mounting one branch or the other is React Navigation's
 * documented auth pattern and makes the illegal state unrepresentable: when the
 * branch flips, the old stack unmounts and no screen has to navigate anywhere.
 *
 * `SignIn` stays registered in the app branch too — it is still the sign-out and
 * re-auth destination, and `dismissToHome` still pops back off it.
 */
export function RootNavigator() {
  const { t } = useTranslation();
  const clerkAuth = useSyncExternalStore(subscribeClerkAuthState, getClerkAuthState);
  const clerkConfigured = resolveClerkPublishableKey() !== "";
  const view = resolveRootStackView({
    clerkConfigured,
    clerkLoaded: clerkAuth.isLoaded,
    clerkSignedIn: clerkAuth.isSignedIn,
  });

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#0D0B1C" },
        headerTintColor: "#F3F1FA",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#0D0B1C" },
      }}
    >
      {view === "loading" ? (
        <Stack.Screen
          name="AuthLoading"
          component={AuthLoadingScreen}
          options={{ headerShown: false }}
        />
      ) : null}
      {view === "auth" ? (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      ) : null}
      {view === "app" ? (
      <Stack.Group>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t("nav.settings") }} />
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
      {/* SignIn is registered here ONLY on a no-key build. When Clerk IS
          configured, the auth branch owns that route name: React Navigation
          keeps the current route across a config change if the new config still
          declares it, so registering "SignIn" in both branches left the user
          sitting on the post-sign-in interstitial instead of landing on Main
          (observed on the iPad sim). With the conditional stack nothing needs to
          navigate to SignIn anyway — signing out flips `isSignedIn`, which flips
          the branch. The no-key build has no auth branch, so it keeps the route
          for BootstrapGate's sign-in affordance. */}
      {!clerkConfigured ? (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: t("nav.signIn") }} />
      ) : null}
      {/* Pure-debug screens — registered only in a __DEV__ build, matching their
          gated Menu rows so a real release has no navigation target for them. */}
      {__DEV__ ? (
        <Stack.Group>
          <Stack.Screen name="ApiSmoke" component={ApiSmokeScreen} options={{ title: t("nav.apiSmoke") }} />
          <Stack.Screen name="NfcSpike" component={NfcSpikeScreen} options={{ title: t("nav.nfcSpike") }} />
          <Stack.Screen name="StorageDebug" component={StorageDebugScreen} options={{ title: t("nav.storageDebug") }} />
          <Stack.Screen name="RealtimeDebug" component={RealtimeDebugScreen} options={{ title: t("nav.realtimeDebug") }} />
          <Stack.Screen name="I18nDebug" component={I18nDebugScreen} options={{ title: t("nav.i18nDebug") }} />
        </Stack.Group>
      ) : null}
      {/* G2Measure — only in a measurement build (EXPO_PUBLIC_ENABLE_MEASURE). */}
      {MEASURE_ENABLED ? (
        <Stack.Screen name="G2Measure" component={G2MeasureScreen} options={{ title: t("nav.g2Measure") }} />
      ) : null}
      {/* G3 routes — placeholders until their slices land. */}
      <Stack.Screen name="EquipmentDetail" component={GatedEquipmentDetail} options={{ title: t("nav.equipmentDetail") }} />
      <Stack.Screen name="Tasks" component={GatedTasks} options={{ title: t("nav.tasks") }} />
      {/* Slice 4: self-gated (BootstrapGate inside — EquipmentListScreen
          precedent) so the same component serves this stack route AND the
          custody-scoped Mine tab; its typed screen props thread directly. */}
      <Stack.Screen name="MyEquipment" component={MyEquipmentScreen} options={{ title: t("nav.myEquipment") }} />
      <Stack.Screen name="Alerts" component={GatedAlerts} options={{ title: t("nav.alerts") }} />
      <Stack.Screen name="Rooms" component={GatedRooms} options={{ title: t("nav.rooms") }} />
      <Stack.Screen name="RoomDetail" component={GatedRoomDetail} options={{ title: t("nav.roomDetail") }} />
      <Stack.Screen name="ShiftChat" component={GatedShiftChat} options={{ title: t("nav.shiftChat") }} />
      <Stack.Screen name="Handoff" component={GatedHandoff} options={{ title: t("nav.handoff") }} />
      <Stack.Screen name="Inventory" component={GatedInventory} options={{ title: t("nav.inventory") }} />
      <Stack.Screen name="AutopilotQueue" component={GatedAutopilotQueue} options={{ title: t("nav.autopilotQueue") }} />
      </Stack.Group>
      ) : null}
    </Stack.Navigator>
  );
}
