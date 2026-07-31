import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RootStackScreenProps } from '../navigation/types';

/** G1 foundation home — entry point; proves the navigation stack composes under New Arch. */
export function HomeScreen({ navigation }: RootStackScreenProps<'Home'>) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>VetTrack</Text>
      <Text style={styles.subtitle}>React Native migration · G1 foundation</Text>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => navigation.navigate('NfcSpike')}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>Open NFC de-risk spike</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a', padding: 24, gap: 8 },
  title: { color: '#f8fafc', fontSize: 34, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 15, marginBottom: 20 },
  btn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
