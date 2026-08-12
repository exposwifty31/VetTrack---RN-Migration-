import { Suspense, lazy, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useIsFocused } from "@react-navigation/native";

import { resolveContainerScan } from "@/components/inventory/container-scan-resolve";
import { setPendingDispenseContainer } from "@/components/inventory/pending-container";
import { useNfcAdvisoryScan, type NfcScanResult } from "@/hooks/useNfcAdvisoryScan";
import { containersApi } from "@/lib/api/containers";
import { extractEquipmentId } from "@/lib/equipment-id";

import type { RootStackScreenProps } from "../navigation/types";

/**
 * Scan — the home "QR / NFC" card's real surface. QR (camera) is the DEFAULT
 * mode; NFC is the secondary toggle. Both are advisory (ADR-006): a decoded id
 * PRE-FILLS ScanConfirm, never auto-committing custody — a human confirms there.
 *
 * QrScanner is `React.lazy`-loaded so expo-camera's native module is NOT pulled
 * into the boot import graph (RootNavigator imports this screen eagerly); it
 * loads only when QR mode mounts. A scanned QR is fed through the SAME canonical
 * `extractEquipmentId` + handoff NFC uses — there is no second scan path.
 */
const QrScanner = lazy(() => import("@/components/scan/QrScanner"));

type ScanMode = "qr" | "nfc";

export function ScanScreen({ navigation }: RootStackScreenProps<"Scan">) {
  const { t } = useTranslation();
  const { supported, reading, scan } = useNfcAdvisoryScan();
  const isFocused = useIsFocused();
  const [mode, setMode] = useState<ScanMode>("qr");
  const [note, setNote] = useState<string | null>(null);

  // The ONE advisory handoff both NFC and QR route their decoded result through:
  // a canonical id pre-fills ScanConfirm; a non-canonical payload falls back to a
  // container lookup then an equipment text-search seed; a failed read notes it.
  const handleResult = useCallback(
    async (result: NfcScanResult) => {
      if (result.status === "ok") {
        navigation.navigate("ScanConfirm", { equipmentId: result.equipmentId });
        return;
      }
      if (result.status === "no_id" && result.payload) {
        const outcome = await resolveContainerScan(result.payload, containersApi.getByNfcTag);
        if (outcome.kind === "container") {
          setPendingDispenseContainer({ id: outcome.container.id, name: outcome.container.name });
          navigation.navigate("Inventory");
          return;
        }
        navigation.navigate("EquipmentList", { initialQuery: outcome.query });
        return;
      }
      setNote(result.status === "read_failed" ? t("scan.readFailed") : t("scan.noId"));
    },
    [navigation, t],
  );

  const onNfcScan = useCallback(async () => {
    setNote(null);
    await handleResult(await scan());
  }, [handleResult, scan]);

  // QR decode → the SAME hardened extractor NFC uses (rejects foreign origins /
  // noncanonical paths) → the SAME handoff. An unresolvable code falls through to
  // the advisory search seed, and yields scan.noId when nothing matches — never a
  // navigation on a bogus id.
  const onQrScanned = useCallback(
    (data: string) => {
      setNote(null);
      const id = extractEquipmentId(data);
      void handleResult(
        id ? { status: "ok", equipmentId: id } : { status: "no_id", payload: data },
      );
    },
    [handleResult],
  );

  if (mode === "qr") {
    return (
      <View className="flex-1 bg-background">
        <Suspense
          fallback={
            <View className="flex-1 items-center justify-center bg-background">
              <ActivityIndicator />
            </View>
          }
        >
          <QrScanner onScanned={onQrScanned} hint={t("scan.qrHint")} active={isFocused} />
        </Suspense>
        <View className="items-center gap-2 px-6 pb-8 pt-4">
          {note ? <Text className="text-center text-[14px] text-muted">{note}</Text> : null}
          <Pressable
            accessibilityRole="button"
            className="items-center rounded-xl border border-border bg-surface px-6 py-3 active:opacity-80"
            onPress={() => {
              setNote(null);
              setMode("nfc");
            }}
          >
            <Text className="text-[15px] font-rubik-semibold text-foreground">{t("scan.useNfc")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // NFC mode (secondary) — the original advisory NFC UI, behavior unchanged.
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-center text-[16px] text-foreground">
        {reading ? t("scan.readReady") : t("scan.prompt")}
      </Text>

      {supported === false ? (
        <Text className="text-center text-[14px] text-danger">{t("scan.unsupported")}</Text>
      ) : null}

      <Pressable
        className="items-center rounded-xl bg-primary px-6 py-3.5 active:opacity-80"
        accessibilityRole="button"
        disabled={reading || supported === false}
        onPress={() => {
          void onNfcScan();
        }}
      >
        {reading ? (
          <ActivityIndicator color="#f8fafc" />
        ) : (
          <Text className="text-[15px] font-semibold text-primary-foreground">
            {t("scan.start")}
          </Text>
        )}
      </Pressable>

      {note ? <Text className="text-center text-[14px] text-muted">{note}</Text> : null}

      <Pressable
        accessibilityRole="button"
        className="items-center rounded-xl border border-border bg-surface px-6 py-3 active:opacity-80"
        onPress={() => {
          setNote(null);
          setMode("qr");
        }}
      >
        <Text className="text-[15px] font-rubik-semibold text-foreground">{t("scan.useQr")}</Text>
      </Pressable>
    </View>
  );
}
