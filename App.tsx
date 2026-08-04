import "./src/global.css";

import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";

import { ClerkTokenBridge } from "./src/infrastructure/auth/ClerkTokenBridge";
import { RealtimeBridge } from "./src/infrastructure/realtime/RealtimeBridge";
import { i18n } from "./src/i18n";
import { queryClient } from "./src/lib/query-client";
import { RootNavigator } from "./src/navigation/RootNavigator";

Uniwind.setTheme("dark");

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * VetTrack RN — app root.
 * QueryClient owns server state; Zustand stays client-only (Slice 1).
 * RealtimeBridge (Slice 5) drives the foreground-only SSE lifecycle; it is
 * Clerk-free (resolves a Bearer via the slice-4 seam) so it sits in the shared
 * tree, mounted in both the ClerkProvider and no-key branches.
 * i18next (Slice 6) is initialized on import of ./src/i18n; Hebrew is default.
 */
export default function App() {
  const tree = (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RealtimeBridge />
          <NavigationContainer>
            {publishableKey ? <ClerkTokenBridge /> : null}
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );

  if (!publishableKey) {
    return tree;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      {tree}
    </ClerkProvider>
  );
}
