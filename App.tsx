import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * VetTrack RN — app root (G1 scaffold slice 1).
 * SafeAreaProvider → NavigationContainer → native-stack RootNavigator.
 * The NFC de-risk spike now lives at src/screens/NfcSpikeScreen.tsx.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
