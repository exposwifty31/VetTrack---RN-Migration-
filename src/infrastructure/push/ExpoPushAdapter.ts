import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type {
  PushData,
  PushDeviceToken,
  PushPlatform,
  PushPort,
  PushResponseHandler,
} from "@/core/ports/push.port";
import { i18n } from "@/i18n";
import { api } from "@/lib/api";

/**
 * The single Android emergency channel id — also named as the `defaultChannel` in
 * app.json's expo-notifications plugin.
 *
 * OS-IMMUTABLE after first creation: Android limits later edits to `name` +
 * `description` only, so importance / vibration / sound are fixed on creation. A
 * future custom looping alarm sound therefore CANNOT be added to this channel —
 * it needs a BRAND-NEW channel id (e.g. `emergency-code-blue-v2`) plus a custom
 * native module (expo-notifications exposes no FLAG_INSISTENT / full-screen-intent
 * path). Owner follow-up; see the G4-3 notes.
 */
export const EMERGENCY_CHANNEL_ID = "emergency-code-blue";

/** setNotificationHandler is process-global; install exactly once. */
let foregroundHandlerInstalled = false;

function toPushPlatform(type: string): PushPlatform | null {
  return type === "ios" || type === "android" ? type : null;
}

function readData(response: Notifications.NotificationResponse): PushData {
  const data = response.notification.request.content.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

/**
 * expo-notifications adapter for the ADR-009 supplementary push channel. Uses the
 * NATIVE device token (APNs/FCM) — never an Expo push token — because the server
 * signs raw APNs/FCM. Fail-loud: unexpected native errors propagate; the only
 * silent path is the physical-device gate (an environment skip, not a no-op).
 */
export class ExpoPushAdapter implements PushPort {
  async requestPermission(): Promise<boolean> {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const request = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
      // allowCriticalAlerts is entitlement-gated (Apple Request 763HU9ZH38) — do
      // NOT pass it until Apple grants it, or requestPermissionsAsync rejects.
    });
    return request.granted;
  }

  async getDeviceToken(): Promise<PushDeviceToken | null> {
    // Physical-device gate: getDevicePushTokenAsync throws on the iOS simulator
    // (no APNs). A non-device is an environment SKIP — return null, not throw.
    if (!Device.isDevice) return null;
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const platform = toPushPlatform(String(devicePushToken.type));
    if (!platform) return null; // web / macos / windows — not a native mobile target
    const token = String(devicePushToken.data).trim();
    if (!token) return null;
    return { platform, token };
  }

  async register(token: PushDeviceToken): Promise<void> {
    // Server registration goes THROUGH the shared authFetch api client (no bespoke
    // fetch path). requireAuth + clinic scope are enforced server-side.
    await api.push.subscribe(token);
  }

  async deregister(token: PushDeviceToken): Promise<void> {
    await api.push.unsubscribe(token);
  }

  async ensureEmergencyChannel(): Promise<void> {
    if (Platform.OS !== "android") return;
    // D1: ONE immutable channel, IMPORTANCE_MAX (heads-up), vibration, PUBLIC on
    // the lockscreen. Created at boot BEFORE the token fetch (Android 13+ requires
    // a channel to exist first). Sound is the channel DEFAULT — a custom alarm is
    // not bundled and cannot be added to this immutable channel later (see
    // EMERGENCY_CHANNEL_ID). `bypassDnd` is deliberately omitted: it silently
    // no-ops without ACCESS_NOTIFICATION_POLICY + a user DND-access grant.
    await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
      name: i18n.t("push.emergencyChannelName"),
      description: i18n.t("push.emergencyChannelDescription"),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      enableLights: true,
      lightColor: "#B00020",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  installForegroundHandler(): void {
    if (foregroundHandlerInstalled) return;
    // handleNotification MUST resolve within 3s or the notification is discarded.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true, // SDK 54+ (replaced shouldShowAlert)
        shouldShowList: true, // SDK 54+
      }),
    });
    foregroundHandlerInstalled = true;
  }

  addResponseListener(onResponse: PushResponseHandler): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      onResponse(readData(response));
    });
    return () => subscription.remove();
  }

  async getInitialResponseData(): Promise<PushData> {
    const last = await Notifications.getLastNotificationResponseAsync();
    return last ? readData(last) : undefined;
  }
}
