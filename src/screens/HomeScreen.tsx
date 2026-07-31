import { Text, TouchableOpacity, View } from 'react-native';

import type { RootStackScreenProps } from '../navigation/types';

/**
 * G1 foundation home. Styled with Uniwind className — the adopted styling layer for the
 * migration (NativeWind v4/v5 is incompatible with Expo SDK 57's Metro; see the Anchor §6).
 * Colors come from the semantic VetTrack theme in src/global.css.
 */
export function HomeScreen({ navigation }: RootStackScreenProps<'Home'>) {
  return (
    <View className="flex-1 bg-background px-6 pt-6">
      <Text className="text-4xl font-extrabold text-foreground">VetTrack</Text>
      <Text className="mb-5 mt-1 text-[15px] text-muted">
        React Native migration · G1 foundation
      </Text>

      <TouchableOpacity
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        onPress={() => navigation.navigate('NfcSpike')}
        accessibilityRole="button"
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          Open NFC de-risk spike
        </Text>
      </TouchableOpacity>
    </View>
  );
}
