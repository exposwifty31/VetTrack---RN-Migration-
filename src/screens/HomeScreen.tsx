import { Pressable, Text, View } from "react-native";

import { contractsBridgeSmoke } from "@/lib/contracts-bridge";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * G1 foundation home. Styled with Uniwind className — the adopted styling layer for the
 * migration (NativeWind v4/v5 is incompatible with Expo SDK 57's Metro; see the Anchor §6).
 * Colors come from the semantic VetTrack theme in src/global.css.
 */
export function HomeScreen({ navigation }: RootStackScreenProps<"Home">) {
  const bridge = contractsBridgeSmoke();

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-4xl font-extrabold text-foreground">VetTrack</Text>
      <Text className="mb-2 mt-1 text-[15px] text-muted">
        React Native migration · G1 foundation · contracts{" "}
        {bridge.allowlistSize} · inactive {bridge.inactiveThresholdDays}d
      </Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("SignIn")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">Sign in (Clerk)</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("ApiSmoke")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">API smoke (Slice 4)</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("NfcSpike")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">
          Open NFC de-risk spike
        </Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("StorageDebug")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">
          Open storage debug (Slice 2)
        </Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        onPress={() => navigation.navigate("RealtimeDebug")}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-foreground">
          Open realtime debug (Slice 5)
        </Text>
      </Pressable>
    </View>
  );
}
