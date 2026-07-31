import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

/**
 * G1 NFC de-risk spike (VetTrack RN migration).
 *
 * Purpose: prove react-native-nfc-manager@3.17.2 works under the New Architecture
 * (mandatory on RN 0.86.2) with the issue #833 patch applied. NFC is the wedge flow;
 * if it can't work here, the migration is a no-go.
 *
 * The "#833 repro" button calls getTag() with NO active session. Before the one-line
 * patch (patches/react-native-nfc-manager+3.17.2.patch), that double-invokes the
 * callback → fatal glog CHECK → SIGABRT under New Arch. After the patch it must return
 * a clean "No session available" error instead of crashing.
 *
 * NFC hardware does not exist on the iOS Simulator — a real tag read requires a device.
 */

type Line = { ts: string; msg: string };

export default function App() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [log, setLog] = useState<Line[]>([]);

  const append = (msg: string) =>
    setLog((prev) => [{ ts: new Date().toLocaleTimeString(), msg }, ...prev].slice(0, 40));

  useEffect(() => {
    (async () => {
      try {
        const ok = await NfcManager.isSupported();
        setSupported(ok);
        append(`isSupported() = ${ok}`);
        if (ok) {
          await NfcManager.start();
          append('NfcManager.start() ok');
        }
      } catch (e: any) {
        setSupported(false);
        append(`init error: ${e?.message ?? String(e)}`);
      }
    })();
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  const scanTag = async () => {
    append('requesting NDEF technology…');
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      append(`getTag() ok: id=${tag?.id ?? 'n/a'}`);
      const payload = tag?.ndefMessage?.[0]?.payload;
      if (payload) {
        try {
          append(`ndef text: ${Ndef.text.decodePayload(new Uint8Array(payload))}`);
        } catch {
          append('ndef present (non-text payload)');
        }
      }
    } catch (e: any) {
      append(`scan error (expected on cancel): ${e?.message ?? String(e)}`);
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  const repro833 = async () => {
    append('#833 repro: calling getTag() with NO session…');
    try {
      const tag = await NfcManager.getTag();
      append(`getTag() returned (no crash): ${JSON.stringify(tag)}`);
    } catch (e: any) {
      append(`getTag() rejected cleanly (patch works): ${e?.message ?? String(e)}`);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>VetTrack · RN Migration</Text>
        <Text style={styles.subtitle}>G1 · NFC de-risk spike (New Architecture)</Text>
        <Text style={styles.badge}>
          NFC supported: {supported === null ? '…' : supported ? 'YES' : 'NO'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btn} onPress={scanTag}>
          <Text style={styles.btnText}>Scan NFC tag (needs device)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnAlt]} onPress={repro833}>
          <Text style={styles.btnText}>Test #833 (getTag, no session)</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {log.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            <Text style={styles.logTs}>{l.ts} </Text>
            {l.msg}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 12 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  badge: { color: '#38bdf8', fontSize: 14, marginTop: 10, fontWeight: '600' },
  buttons: { paddingHorizontal: 20, gap: 12 },
  btn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnAlt: { backgroundColor: '#7c3aed' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logBox: { flex: 1, margin: 20, backgroundColor: '#020617', borderRadius: 12 },
  logContent: { padding: 14 },
  logLine: { color: '#cbd5e1', fontSize: 12, fontFamily: 'Courier', marginBottom: 6 },
  logTs: { color: '#475569' },
});
