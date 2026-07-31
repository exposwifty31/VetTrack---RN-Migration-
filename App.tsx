import "./src/global.css";

import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";

import { ClerkTokenBridge } from "./src/infrastructure/auth/ClerkTokenBridge";
import { RootNavigator } from "./src/navigation/RootNavigator";

Uniwind.setTheme("dark");

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * VetTrack RN — app root.
 * ClerkProvider uses SecureStore-backed tokenCache (not MMKV) for session tokens.
 * Without a publishable key the tree still mounts so scaffolding screens work offline.
 */
export default function App() {
  const tree = (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        {publishableKey ? <ClerkTokenBridge /> : null}
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
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
