import "./src/global.css";

import { type ReactNode, useEffect } from "react";
// Per-weight subpath imports — the package root re-exports every weight and
// would drag all 14 Rubik ttfs (~3MB) into the bundle; we ship exactly four.
import { Rubik_400Regular } from "@expo-google-fonts/rubik/400Regular";
import { Rubik_500Medium } from "@expo-google-fonts/rubik/500Medium";
import { Rubik_600SemiBold } from "@expo-google-fonts/rubik/600SemiBold";
import { Rubik_700Bold } from "@expo-google-fonts/rubik/700Bold";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { I18nextProvider } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Uniwind, useUniwind } from "uniwind";

import { ClerkTokenBridge } from "./src/infrastructure/auth/ClerkTokenBridge";
import { PushBridge } from "./src/infrastructure/push/PushBridge";
import { RealtimeBridge } from "./src/infrastructure/realtime/RealtimeBridge";
import { i18n } from "./src/i18n";
import { resolveInitialTheme } from "./src/features/account/theme-resolver";
import { installDevAuthSeam } from "./src/lib/dev-auth";
import { OfflineQueueBanner } from "./src/lib/offline-queue/OfflineQueueBanner";
import { OfflineQueueBridge } from "./src/lib/offline-queue/OfflineQueueBridge";
import { queryClient } from "./src/lib/query-client";
import { linking } from "./src/navigation/linking";
import { flushPendingNavTarget, navigationRef } from "./src/navigation/navigationRef";
import { RootNavigator } from "./src/navigation/RootNavigator";

// Theme boot: the persisted choice, else the LIGHT product default (see
// theme-resolver). NOT a bare `setTheme()` — that silently follows the OS and
// would change the default; "system" only follows the OS when the user picks it.
Uniwind.setTheme(resolveInitialTheme());

// Dev-only, opt-in, and refused when a Clerk key is configured — see
// src/lib/dev-auth.ts for the five guard rails. Module scope so the identity
// bootstrap query already sees the fallback token on its first run.
installDevAuthSeam();

// Keep the native splash up while App renders no tree (font resolution below).
// Must run at module scope, before the first render. Failure is non-fatal —
// worst case the OS hides the splash on its own schedule.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * Status-bar icons derived from the EFFECTIVE Uniwind theme — dark icons on the
 * Light theme, light icons on Dark. `useUniwind().theme` is always the resolved
 * "light" | "dark" (setTheme("system") resolves to the OS scheme and adaptive
 * updates re-fire the listener), so this tracks live theme changes too.
 */
function ThemedStatusBar() {
  const { theme } = useUniwind();
  return <StatusBar style={theme === "light" ? "dark" : "light"} />;
}

/**
 * VetTrack RN — app root.
 * QueryClient owns server state; Zustand stays client-only (Slice 1).
 * RealtimeBridge (Slice 5) drives the foreground-only SSE lifecycle; it is
 * Clerk-free (resolves a Bearer via the slice-4 seam) so it sits in the shared
 * tree, mounted in both the ClerkProvider and no-key branches.
 * OfflineQueueBridge (G4-6) is the same pattern for the offline write-queue:
 * foreground/auth-signal-triggered replay, no polling, Clerk-free.
 * i18next (Slice 6) is initialized on import of ./src/i18n; Hebrew is default.
 */
export default function App() {
  // Aurora (G2.5): Rubik is the app family (400–700). Render nothing until the
  // fonts resolve; on a load ERROR degrade gracefully to system fonts instead
  // of blanking the app forever.
  const [fontsLoaded, fontError] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  const tree = (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <RealtimeBridge />
          <OfflineQueueBridge />
          {/* Failure surface for the offline write-queue: shows a paused-circuit /
              dropped-write / pending-backlog banner (offline-queue-status). */}
          <OfflineQueueBanner />
          {/* Clerk-free + nav-context-free (drives tap navigation via navigationRef);
              sits in the shared tree like RealtimeBridge so it runs in both branches. */}
          <PushBridge />
          <NavigationContainer ref={navigationRef} linking={linking} onReady={flushPendingNavTarget}>
            {publishableKey ? <ClerkTokenBridge /> : null}
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );

  // GestureHandlerRootView must be the OUTERMOST element (G2 delight stack —
  // Gesture Handler no-ops silently without it).
  const withRoot = (node: ReactNode) => (
    <GestureHandlerRootView style={{ flex: 1 }}>{node}</GestureHandlerRootView>
  );

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (!publishableKey) {
    return withRoot(tree);
  }

  return withRoot(
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      {tree}
    </ClerkProvider>,
  );
}
