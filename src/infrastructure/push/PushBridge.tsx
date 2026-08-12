import { useEffect, useRef } from "react";

import { useIdentity } from "@/app/useIdentity";
import type { PushDeviceToken, PushPort } from "@/core/ports/push.port";
import { type AuthChange, subscribeAuthChange } from "@/lib/auth-fetch";
import { getCurrentUserId } from "@/lib/auth-store";
import { navigateToEmergency, navigateToMain } from "@/navigation/navigationRef";

import {
  deregisterActivePushRegistration,
  setActivePushRegistration,
} from "./active-registration";
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
 *   - Token rotation: APNs/FCM can roll the native token while the app runs; the
 *     old token stops delivering. A rotation listener re-registers the replacement
 *     while an authenticated user is active and is removed with the registration
 *     effect. Submissions are ORDER-SAFE: every register() takes a monotonic seq
 *     and only the highest seq commits, so overlapping registers resolving out of
 *     order always leave the NEWEST token as the deregister target; a rotation
 *     arriving before the initial POST is deferred (newest only) and wins after it.
 *   - Deregister on sign-out: the AUTHENTICATED path is the sign-out UI calling
 *     `deregisterActivePushRegistration()` BEFORE tearing the session down (the
 *     bearer is still valid there — see active-registration.ts). The "cleared"
 *     handler below is the take-once FALLBACK for teardowns that skipped that seam
 *     (session expiry, dev path); it fires after the Clerk getter is gone, so its
 *     DELETE succeeds only where a stored bearer survives. Orphans are pruned
 *     server-side on delivery failure. The frozen ClerkTokenBridge /
 *     AuthSessionPort wiring stays untouched.
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
    // Rotation ordering (PR #54 round-2): register() calls may overlap and resolve
    // out of order, so each submission takes a monotonic seq and only the HIGHEST
    // seq ever commits (registeredToken + active-registration) — a late-resolving
    // stale register can no longer overwrite the newest token as the deregister
    // target. A rotation arriving before the flow below reaches its own POST is
    // cached (newest only) and submitted right after it, where its higher seq wins.
    let nextSeq = 0;
    let committedSeq = 0;
    let submitAllowed = false;
    let pendingRotation: PushDeviceToken | null = null;

    const submit = (token: PushDeviceToken, label: string) => {
      const seq = ++nextSeq;
      void port
        .register(token)
        .then(() => {
          if (cancelled || seq <= committedSeq) return; // a newer token already committed
          committedSeq = seq;
          registeredToken.current = token;
          setActivePushRegistration(port, token);
        })
        .catch((err) => {
          console.warn(`[push] ${label} registration failed (non-fatal):`, err);
        });
    };

    // Rotation listener lives exactly as long as this registration attempt.
    const stopTokenListener = port.addTokenListener((rotated) => {
      if (cancelled) return;
      const current = registeredToken.current;
      if (current && current.platform === rotated.platform && current.token === rotated.token) {
        return;
      }
      if (!submitAllowed) {
        // Permission/token flow hasn't cleared yet — nothing may POST. Keep only
        // the newest rotation; it is submitted after the initial token.
        pendingRotation = rotated;
        return;
      }
      submit(rotated, "rotated-token");
    });
    void (async () => {
      // `cancelled` is re-checked after EVERY await: an unmount / identity swap
      // mid-flight must not prompt for permission or register a stale attempt.
      await port.ensureEmergencyChannel();
      if (cancelled) return;
      const granted = await port.requestPermission();
      if (!granted || cancelled) return;
      const token = await port.getDeviceToken();
      if (!token || cancelled) return;
      submitAllowed = true;
      submit(token, "initial");
      // Assertion, not annotation: TS's flow analysis cannot see the
      // listener-callback assignment and narrows this read to `null` otherwise.
      const rotated = pendingRotation as PushDeviceToken | null;
      pendingRotation = null;
      if (rotated && (rotated.platform !== token.platform || rotated.token !== token.token)) {
        submit(rotated, "rotated-token"); // higher seq — the newest token wins
      }
    })().catch((err) => {
      console.warn("[push] registration skipped/failed (non-fatal):", err);
    });
    return () => {
      cancelled = true;
      stopTokenListener();
    };
  }, [port, identityReady, userId]);

  // Take-once fallback deregister on "cleared" (see the header caveat — the
  // authenticated path already ran in the sign-out UI, making this a no-op).
  useEffect(() => {
    return onAuthChange((change) => {
      if (change !== "cleared") return;
      registeredToken.current = null;
      void deregisterActivePushRegistration();
    });
  }, [onAuthChange]);

  return null;
}
