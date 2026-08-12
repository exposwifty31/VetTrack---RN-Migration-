import { useEffect, useRef } from "react";

import { useIdentity } from "@/app/useIdentity";
import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";
import { type AuthChange, subscribeAuthChange } from "@/lib/auth-fetch";
import { getCurrentUserId } from "@/lib/auth-store";
import { navigateToEmergency, navigateToMain } from "@/navigation/navigationRef";

import { getDefaultPushPort } from "./defaultPush";
import { resolvePushNavTarget } from "./push-deep-link";

type AuthChangeSubscribe = (listener: (change: AuthChange) => void) => () => void;

/**
 * Native push lifecycle (G4-3) — a headless bridge mounted at App level, mirroring
 * RealtimeBridge / ClerkTokenBridge. Clerk-free and navigation-context-free: it
 * reads identity via the shared `useIdentity` query and navigates a notification
 * tap through the container ref (a tap is a global native callback with no nav
 * context — `useNavigation` would throw here).
 *
 * ADR-009 (binding): push is SUPPLEMENTARY. The tap handler ONLY navigates — it
 * never setQueryData / onMutate / writes any Code Blue / emergency cache; SSE stays
 * the state channel. Nothing emergency is queued.
 *
 *   - Foreground presentation handler + tap → navigate: installed on mount,
 *     independent of auth (a cold-start tap must route even before sign-in settles).
 *   - Registration (permission → native token → POST /subscribe): fires only once
 *     identity has resolved AND a userId is set — authFetch guards every /api route
 *     except /users/me on a non-null userId, so registering earlier would throw.
 *     Android creates the immutable channel BEFORE the token fetch (Android 13+).
 *   - Deregister on sign-out: BEST-EFFORT ONLY. The "cleared" signal fires AFTER
 *     the Clerk token getter is torn down, so authFetch throws AUTH_INVALID and the
 *     DELETE is a no-op under Clerk sign-out BY CONSTRUCTION (it succeeds only where
 *     a stored bearer survives — the dev path). Orphaned tokens are pruned
 *     server-side on delivery failure. Left best-effort to avoid touching the frozen
 *     ClerkTokenBridge / AuthSessionPort sign-out wiring.
 */
export function PushBridge({
  port = getDefaultPushPort(),
  onAuthChange = subscribeAuthChange,
}: {
  port?: PushPort;
  onAuthChange?: AuthChangeSubscribe;
}) {
  const identity = useIdentity();
  const identityReady = identity.isSuccess && !!getCurrentUserId();
  const userId = identity.data?.id;
  const registeredToken = useRef<PushDeviceToken | null>(null);

  // Foreground handler + tap navigation (ALERT-ONLY). getInitialResponseData covers
  // a cold start launched from a tap; navigate* queue the target until the container
  // is ready (App.tsx flushes it onReady), so a race never drops the tap.
  useEffect(() => {
    port.installForegroundHandler();
    const navigate = (data: Parameters<typeof resolvePushNavTarget>[0]) => {
      if (resolvePushNavTarget(data).screen === "Emergency") navigateToEmergency();
      else navigateToMain();
    };
    const unsubscribe = port.addResponseListener(navigate);
    void port.getInitialResponseData().then((data) => {
      if (data) navigate(data);
    });
    return unsubscribe;
  }, [port]);

  // Registration — only after identity resolves and a userId exists.
  useEffect(() => {
    if (!identityReady) return;
    let cancelled = false;
    void (async () => {
      await port.ensureEmergencyChannel();
      const granted = await port.requestPermission();
      if (!granted || cancelled) return;
      const token = await port.getDeviceToken();
      if (!token || cancelled) return;
      await port.register(token);
      if (!cancelled) registeredToken.current = token;
    })().catch((err) => {
      console.warn("[push] registration skipped/failed (non-fatal):", err);
    });
    return () => {
      cancelled = true;
    };
  }, [port, identityReady, userId]);

  // Best-effort deregister on sign-out (see the header caveat).
  useEffect(() => {
    return onAuthChange((change) => {
      if (change !== "cleared") return;
      const token = registeredToken.current;
      if (!token) return;
      registeredToken.current = null;
      port.deregister(token).catch(() => {
        // Expected under Clerk sign-out (Bearer already gone). Non-fatal.
      });
    });
  }, [port, onAuthChange]);

  return null;
}
