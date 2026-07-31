import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

import { useAppStore } from '../store/useAppStore';

/**
 * G1 NFC de-risk spike (moved out of App.tsx into a navigated screen).
 *
 * Proves react-native-nfc-manager@3.17.2 works under the New Architecture (mandatory on
 * RN 0.86.2) with the issue #833 patch applied. NFC is the wedge flow; if it can't work
 * here, the migration is a no-go.
 *
 * The "#833 repro" button calls getTag() with NO active session. Before the one-line patch
 * (patches/react-native-nfc-manager+3.17.2.patch), that double-invokes the callback → fatal
 * glog CHECK → SIGABRT under New Arch. After the patch it returns a clean error instead.
 *
 * NFC hardware does not exist on the iOS Simulator — a real tag read requires a device.
 *
 * Styled with Uniwind className + the semantic VetTrack theme (src/global.css).
 */
type Line = { id: number; ts: string; msg: string };
let nextLogId = 0;

export function NfcSpikeScreen() {
  const nfcSupported = useAppStore((state) => state.nfcSupported);
  const setNfcSupported = useAppStore((state) => state.setNfcSupported);
  const [log, setLog] = useState<Line[]>([]);

  const append = (msg: string) =>
    setLog((prev) =>
      [{ id: nextLogId++, ts: new Date().toLocaleTimeString(), msg }, ...prev].slice(0, 40),
    );

  useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        const ok = await NfcManager.isSupported();
        if (!isActive) return;
        setNfcSupported(ok);
        append(`isSupported() = ${ok}`);
        if (ok) {
          await NfcManager.start();
          if (!isActive) return;
          append('NfcManager.start() ok');
        }
      } catch (e: any) {
        if (!isActive) return;
        setNfcSupported(false);
        append(`init error: ${e?.message ?? String(e)}`);
      }
    })();
    return () => {
      isActive = false;
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, [setNfcSupported]);

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
    <View className="flex-1 bg-background">
      <View className="px-5 pb-5 pt-3">
        <Text className="text-[15px] font-semibold text-info">
          NFC supported: {nfcSupported === null ? '…' : nfcSupported ? 'YES' : 'NO'}
        </Text>
        <Text className="mt-1 text-xs text-muted">
          Simulator has no NFC — real tag read needs a device.
        </Text>
      </View>

      <View className="gap-3 px-5">
        <TouchableOpacity
          className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
          onPress={scanTag}
          accessibilityRole="button"
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">
            Scan NFC tag (needs device)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="items-center rounded-xl bg-accent py-3.5 active:opacity-80"
          onPress={repro833}
          accessibilityRole="button"
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">
            Test #833 (getTag, no session)
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="m-5 flex-1 rounded-xl bg-surface" contentContainerClassName="p-3.5">
        {log.map((l) => (
          <Text key={l.id} className="mb-1.5 font-mono text-xs text-slate-300">
            <Text className="text-slate-600">{l.ts} </Text>
            {l.msg}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
