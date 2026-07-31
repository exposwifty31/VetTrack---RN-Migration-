import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/HomeScreen';
import { NfcSpikeScreen } from '../screens/NfcSpikeScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Native-stack root navigator (screens 4.x + native-stack 7.x, New Arch). */
export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f8fafc',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#0f172a' },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'VetTrack · RN' }} />
      <Stack.Screen
        name="NfcSpike"
        component={NfcSpikeScreen}
        options={{ title: 'NFC de-risk spike' }}
      />
    </Stack.Navigator>
  );
}
