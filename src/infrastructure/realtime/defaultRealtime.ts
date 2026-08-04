import EventSource from "react-native-sse";

import type { RealtimePort } from "@/core/ports/realtime.port";
import { resolveApiUrl } from "@/lib/api-origin";
import { isValidJwt, resolveBearerToken } from "@/lib/auth-fetch";

import { SseAdapter, type SseFactory, type SseLike } from "./SseAdapter";

/**
 * react-native-sse is pure JS (XHR-based) — no native module, no config plugin, no
 * prebuild. Its types resolve by co-location (index.d.ts sits next to index.js;
 * package.json declares only `main`, no `types` field), which TS honors under the
 * repo's bundler moduleResolution. The cast below bridges its generic EventSource
 * type to our minimal SseLike at the single infrastructure boundary (event-map
 * generics differ structurally).
 */
const reactNativeSseFactory: SseFactory = (url, options) =>
  new EventSource(url, {
    method: options.method,
    headers: options.headers,
    pollingInterval: options.pollingInterval,
    debug: options.debug,
  }) as unknown as SseLike;

let singleton: SseAdapter | null = null;

/** Production singleton RealtimePort wired to react-native-sse + the slice-4 auth seam. */
export function getDefaultRealtimePort(): RealtimePort {
  if (singleton) return singleton;
  singleton = new SseAdapter({
    factory: reactNativeSseFactory,
    resolveUrl: resolveApiUrl,
    resolveToken: resolveBearerToken,
    isValidToken: isValidJwt,
    // Bearer over cleartext http:// is refused in production (CWE-319); permitted
    // only in dev so on-device Expo (http://<LAN-IP>:3001) keeps working.
    allowInsecureAuth: __DEV__,
    debug: __DEV__,
  });
  return singleton;
}

/** Test-only: reset the production singleton between suites. */
export function __resetDefaultRealtimePortForTests(): void {
  singleton?.close();
  singleton = null;
}
