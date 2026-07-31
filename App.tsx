import './src/global.css';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { RootNavigator } from './src/navigation/RootNavigator';

// VetTrack ships a dark clinical UI. Force dark above the component tree so the
// theme is resolved once, before first paint, instead of switching at runtime.
Uniwind.setTheme('dark');

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
