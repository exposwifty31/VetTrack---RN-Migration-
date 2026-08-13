/**
 * Advisory QR reader (default export so ScanScreen can `React.lazy` it — that
 * keeps expo-camera's native module OUT of the boot import graph; it evaluates
 * only when QR mode first mounts). Decodes a QR to its raw string and hands it
 * up; the caller runs it through the SAME canonical `extractEquipmentId` +
 * ScanConfirm handoff that NFC uses (ADR-006 advisory: never auto-commits).
 *
 * Permission-denied fails LOUD — an explicit message + action (request, or open
 * Settings once the OS won't re-prompt), never a silent black frame.
 */
import { useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CameraView, useCameraPermissions } from "expo-camera";

type QrScannerProps = Readonly<{
  /** Raw decoded QR string (a canonical URL or a bare id) handed to the caller. */
  onScanned: (data: string) => void;
  /** Viewfinder hint copy (already localized by the caller). */
  hint: string;
  /**
   * Scan only while the Scan screen is focused. ScanConfirm is a transparent
   * modal, so this screen (and the camera) stays mounted underneath it — without
   * this gate a code still in frame re-fires after the debounce and stacks
   * confirm screens.
   */
  active: boolean;
}>;

export default function QrScanner({ onScanned, hint, active }: QrScannerProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  // onBarcodeScanned fires continuously; debounce to one hand-off per ~2s so a
  // single code can't push ScanConfirm repeatedly (re-arms after returning).
  const lastFireRef = useRef(0);
  // Camera preview failed to start (onMountError) — fail LOUD with a localized
  // state instead of a silent black frame, same doctrine as permission-denied.
  const [mountFailed, setMountFailed] = useState(false);

  if (!permission) {
    // Permission state still resolving — brief neutral frame.
    return <View className="flex-1 bg-background" />;
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-center text-[16px] font-rubik-semibold text-foreground">
          {t("scan.cameraPermissionTitle")}
        </Text>
        <Text className="text-center text-[14px] text-muted">
          {blocked ? t("scan.cameraDenied") : t("scan.cameraPermissionBody")}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-xl bg-primary px-6 py-3 active:opacity-80"
          onPress={() => {
            if (blocked) void Linking.openSettings();
            else void requestPermission();
          }}
        >
          <Text className="text-[15px] font-rubik-semibold text-primary-foreground">
            {blocked ? t("scan.openSettings") : t("scan.grantCamera")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (mountFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-center text-[15px] text-muted">
          {t("scan.cameraUnavailable")}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraView
        style={{ flex: 1 }}
        active={active}
        facing="back"
        onMountError={() => setMountFailed(true)}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          // Ignore scans while unfocused (ScanConfirm open on top): the debounce
          // alone would let a code still in frame re-fire and stack confirms.
          if (!active) return;
          const now = Date.now();
          if (now - lastFireRef.current < 2000) return;
          lastFireRef.current = now;
          onScanned(result.data);
        }}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-56 w-56 rounded-2xl border-2 border-white/80" />
        <Text className="mt-4 rounded-full bg-black/50 px-4 py-1.5 text-center text-[13px] text-white">
          {hint}
        </Text>
      </View>
    </View>
  );
}
