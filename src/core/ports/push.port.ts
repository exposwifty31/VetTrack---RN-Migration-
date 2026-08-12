/**
 * Framework-free native-push port (mirrors AuthSessionPort / RealtimePort / StoragePort).
 *
 * Owns the device push subsystem for ADR-009 SUPPLEMENTARY alerting: OS permission,
 * the native device token (APNs on iOS / FCM on Android — NOT an Expo push token,
 * because the server signs raw APNs/FCM), the one immutable Android "Emergency /
 * Code Blue" channel, the foreground presentation handler, and the tap-response
 * stream.
 *
 * ADR-009 (binding, Clinical Safety Officer veto): push is an ALERT + DEEP-LINK
 * channel only. Nothing here carries, sets, or mutates Code Blue / emergency state
 * — SSE stays the state channel. A tap may NAVIGATE; it must never setQueryData /
 * onMutate / write any emergency cache, and nothing emergency is ever queued.
 *
 * `register` / `deregister` talk to POST/DELETE `/api/push/subscribe` THROUGH the
 * shared authFetch api client — never a bespoke fetch path.
 *
 * Fail-loud (AGENTS.md port convention): a genuinely-unavailable native module
 * throws; it never silently no-ops. A simulator/emulator with no push hardware is
 * an environment SKIP (`getDeviceToken` → null), NOT an unavailable adapter.
 */

/** Server `platform` enum for the native subscribe branch (push-subscription-schema.ts). */
export type PushPlatform = "ios" | "android";

/** A resolved native device token + its platform tag. */
export interface PushDeviceToken {
  platform: PushPlatform;
  token: string;
}

/** Opaque notification `data` bag (server-defined payload). Read-only to the client. */
export type PushData = Record<string, unknown> | undefined;

/** Tap-response handler — receives the notification data ONLY (ADR-009: navigate, never mutate). */
export type PushResponseHandler = (data: PushData) => void;

export interface PushPort {
  /** Prompt (or read) OS notification permission. Resolves true only when granted. */
  requestPermission(): Promise<boolean>;
  /**
   * Resolve the native device token ({platform, token}). Returns null on a
   * simulator/emulator or when permission is not granted (environment skip, not a
   * failure). Android callers MUST have created the channel first (Android 13+).
   */
  getDeviceToken(): Promise<PushDeviceToken | null>;
  /** Register the token with the server (POST /api/push/subscribe). */
  register(token: PushDeviceToken): Promise<void>;
  /** Deregister the token from the server (DELETE /api/push/subscribe). */
  deregister(token: PushDeviceToken): Promise<void>;
  /**
   * Android: create the ONE immutable emergency channel (IMPORTANCE_MAX, vibration,
   * PUBLIC lockscreen) BEFORE any token fetch. No-op on iOS.
   */
  ensureEmergencyChannel(): Promise<void>;
  /** Install the module-scope foreground presentation handler (idempotent). */
  installForegroundHandler(): void;
  /** Subscribe to notification taps. Returns an unsubscribe fn. ALERT-ONLY. */
  addResponseListener(onResponse: PushResponseHandler): () => void;
  /**
   * Subscribe to NATIVE token rotation — APNs/FCM may roll the device token while
   * the app runs, and the old token stops delivering. Fires only with a valid
   * mobile token (same platform/emptiness gates as `getDeviceToken`). Returns an
   * unsubscribe fn; callers re-register the replacement for the active user.
   */
  addTokenListener(onToken: (token: PushDeviceToken) => void): () => void;
  /** Cold-start: the notification data that launched the app from a tap, if any. */
  getInitialResponseData(): Promise<PushData>;
}
