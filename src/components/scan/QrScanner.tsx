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
import { useLayoutEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useAppActive } from "@/hooks/useAppActive";

type QrScannerProps = Readonly<{
  /** Raw decoded QR string (a canonical URL or a bare id) handed to the caller. */
  onScanned: (data: string) => void;
  /** Viewfinder hint copy (already localized by the caller). */
  hint: string;
  /**
   * Scan only while the Scan screen is focused. ScanConfirm is a transparent
   * modal, so this screen stays mounted underneath it. CameraView itself is
   * unmounted while inactive — its `active` prop is iOS-only, so unmounting is
   * the only way to actually release the Android camera session; it also stops
   * a code still in frame from re-firing and stacking confirm screens.
   *
   * Focus is only HALF the gate: backgrounding the app never changes navigation
   * focus, so this prop stays true and the camera would keep its session (and
   * the torch) alive off-screen and can hang on resume. `useAppActive()` is
   * ANDed in below, so the session is held only while focused AND foregrounded.
   */
  active: boolean;
}>;

export default function QrScanner({ onScanned, hint, active }: QrScannerProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const appActive = useAppActive();
  // Focus AND foreground — see the `active` prop doc above.
  const cameraActive = active && appActive;
  // The native module holds the closure from the render it was mounted in, so
  // a queued barcode event can fire with a STALE `cameraActive` captured as
  // true after the gate has flipped. The ref always carries the latest value;
  // the handler reads it instead of the captured one.
  const cameraActiveRef = useRef(cameraActive);
  // Layout effect, not passive: a queued native event can run after the
  // inactive commit but BEFORE a passive effect flushes, and would read the
  // ref's previous `true` in exactly the window the ref exists to close.
  useLayoutEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);
  // onBarcodeScanned fires continuously; debounce to one hand-off per ~2s so a
  // single code can't push ScanConfirm repeatedly (re-arms after returning).
  const lastFireRef = useRef(0);
  // Camera preview failed to start (onMountError) — fail LOUD with a localized
  // state instead of a silent black frame, same doctrine as permission-denied.
  const [mountFailed, setMountFailed] = useState(false);
  // Torch is a declarative expo-camera prop (Camera.types.d.ts:392, no @platform
  // tag — iOS CameraSessionManager.swift:180, Android ExpoCameraView.kt:351).
  // The choice is deliberately KEPT across the background→foreground remount:
  // the camera session drops (so the LED is physically off while away) but a
  // dark ward is still dark on resume, and re-arming beats making the operator
  // re-find the control one-handed.
  const [torchOn, setTorchOn] = useState(false);

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
      {cameraActive ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          enableTorch={torchOn}
          onMountError={() => setMountFailed(true)}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(result) => {
            // Read through the ref, not the captured value: the closure the
            // native module holds is from an earlier render, so the captured
            // `cameraActive` can be true after the gate flipped false.
            if (!cameraActiveRef.current) return;
            const now = Date.now();
            if (now - lastFireRef.current < 2000) return;
            lastFireRef.current = now;
            onScanned(result.data);
          }}
        />
      ) : (
        // Neutral frame under the transparent ScanConfirm modal while the
        // camera session is released.
        <View className="flex-1 bg-background" />
      )}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-56 w-56 rounded-2xl border-2 border-white/80" />
        <Text className="mt-4 rounded-full bg-black/50 px-4 py-1.5 text-center text-[13px] text-white">
          {hint}
        </Text>
      </View>
      {/* Sibling of the viewfinder overlay, NOT a child — that overlay is
          pointerEvents="none" and would swallow the tap. Offered only while a
          session is actually held; expo-camera 57 exposes no torch-capability
          query, so a torchless device silently no-ops in native (guarded by
          `device.hasTorch`, CameraSessionManager.swift:181). */}
      {cameraActive ? (
        <View className="absolute bottom-8 self-center">
          <Pressable
            testID="torch-toggle"
            accessibilityRole="button"
            accessibilityLabel={t("scan.torch")}
            accessibilityState={{ selected: torchOn }}
            className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-5 py-3 active:opacity-80 ${
              torchOn ? "bg-white" : "bg-black/50"
            }`}
            onPress={() => setTorchOn((prev) => !prev)}
          >
            <Text
              className={`text-[14px] font-rubik-semibold ${
                torchOn ? "text-black" : "text-white"
              }`}
            >
              {t("scan.torch")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
