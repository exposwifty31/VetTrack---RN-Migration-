import type { PushPort } from "@/core/ports/push.port";

import { ExpoPushAdapter } from "./ExpoPushAdapter";

let singleton: PushPort | null = null;

/** Production singleton PushPort wired to expo-notifications + expo-device. */
export function getDefaultPushPort(): PushPort {
  if (!singleton) singleton = new ExpoPushAdapter();
  return singleton;
}

/** Test-only: reset the production singleton between suites. */
export function __resetDefaultPushPortForTests(): void {
  singleton = null;
}
