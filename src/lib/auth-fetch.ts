/**
 * Token-indirection + Bearer authFetch for RN.
 * RN has no cookie jar — Bearer-only (no credentials: "include").
 */

import { resolveApiUrl } from "@/lib/api-origin";
import { getCurrentUserId, getStoredBearerToken } from "@/lib/auth-store";
import { emergencyOfflineErrorFromFailedDispatch, isNetworkFailure } from "@/lib/emergency-block";
import { enqueueOfflineWrite } from "@/lib/offline-queue/offline-queue";

type ClerkTokenGetter = (() => Promise<string | null>) | null;

let clerkTokenGetter: ClerkTokenGetter = null;

/**
 * Auth-identity transition kinds surfaced to Clerk-free consumers (e.g. RealtimeBridge):
 *   - "ready"   — a token getter was installed where none existed (sign-in).
 *   - "changed" — a DIFFERENT getter replaced a non-null one (account switch): the
 *                 Bearer identity changed, so an open stream must reconnect.
 *   - "cleared" — the getter was removed (sign-out): no valid token remains.
 */
export type AuthChange = "ready" | "changed" | "cleared";
type AuthChangeListener = (change: AuthChange) => void;
const authChangeListeners = new Set<AuthChangeListener>();

/**
 * Subscribe to auth-identity transitions. Lets the transport layer keep the SSE
 * stream aligned with the current Bearer identity WITHOUT importing Clerk: reopen
 * on sign-in, close-then-reopen on account switch, and close on sign-out. Returns
 * an unsubscribe fn. (auth-fetch owns the signal; the consumer owns open/close.)
 */
export function subscribeAuthChange(listener: AuthChangeListener): () => void {
  authChangeListeners.add(listener);
  return () => {
    authChangeListeners.delete(listener);
  };
}

function notifyAuthChange(change: AuthChange): void {
  for (const listener of authChangeListeners) listener(change);
}

export function setClerkTokenGetter(getter: ClerkTokenGetter): void {
  const previous = clerkTokenGetter;
  clerkTokenGetter = getter;
  if (getter === previous) return; // no identity transition
  if (getter === null) {
    notifyAuthChange("cleared"); // sign-out
  } else if (previous === null) {
    notifyAuthChange("ready"); // sign-in (was: notifyAuthReady)
  } else {
    notifyAuthChange("changed"); // account switch — different non-null getter
  }
}

export function getClerkTokenGetter(): ClerkTokenGetter {
  return clerkTokenGetter;
}

export function isValidJwt(token?: string | null): boolean {
  return !!token && token.split(".").length === 3;
}

function base64UrlToUtf8(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  if (typeof atob === "function") {
    return atob(padded);
  }
  const Buf = (
    globalThis as { Buffer?: { from(data: string, enc: string): { toString(enc: string): string } } }
  ).Buffer;
  if (Buf) {
    return Buf.from(padded, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
}

/** Decode JWT payload (no verify) — used for azp gating checks. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!isValidJwt(token)) return null;
  try {
    const segment = token.split(".")[1];
    const parsed: unknown = JSON.parse(base64UrlToUtf8(segment));
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Prefer Clerk getter; fall back to stored/dev bearer. */
export async function resolveToken(): Promise<string | null> {
  if (clerkTokenGetter) {
    const token = await clerkTokenGetter();
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  const stored = getStoredBearerToken();
  return typeof stored === "string" ? stored.trim() : null;
}

export async function resolveBearerToken(): Promise<string | null> {
  return resolveToken();
}

/**
 * Network dispatch with the frozen no-offline-emergency-queueing doctrine: a
 * network-level rejection on a Code Blue mutation becomes a loud
 * `EmergencyOfflineError` (never queued, never retried); every other failure
 * — and every successful response — passes through 100% unchanged.
 *
 * G4-6: a network-level rejection on a NON-emergency write is additionally
 * captured into the offline write-queue as a pure side effect (see
 * `enqueueOfflineWrite`, which itself refuses GETs, non-`/api/*` paths, and
 * — belt-and-suspenders — emergency endpoints). This does NOT change what
 * this function throws: the caller still sees the original network error,
 * byte-identical to the pre-G4-6 contract (`auth-fetch.emergency.test.ts`).
 * Capturing the write for later replay is not the same as reporting success.
 */
async function dispatchFetch(
  resolvedUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(resolvedUrl, init);
  } catch (err) {
    const blocked = emergencyOfflineErrorFromFailedDispatch(err, path, init.method ?? "GET");
    if (blocked) throw blocked;
    if (isNetworkFailure(err)) {
      enqueueOfflineWrite({
        endpoint: path,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? init.body : "",
      });
    }
    throw err;
  }
}

export class AuthFetchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AuthFetchError";
    this.status = status;
  }
}

/**
 * Authenticated fetch — attaches Bearer only for valid 3-segment JWTs.
 * Uses RN's global `fetch` (set EXPO_PUBLIC_USE_RN_FETCH=1; avoid expo/fetch races).
 */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const resolvedUrl = resolveApiUrl(path);

  if (path.startsWith("/api/")) {
    const token = await resolveToken();
    if (!isValidJwt(token)) {
      throw new AuthFetchError("AUTH_INVALID: invalid token");
    }

    // Bootstrap: /api/users/me may run before setCurrentUserId; other routes require it.
    const userId = getCurrentUserId()?.trim();
    if (!userId && path !== "/api/users/me") {
      throw new AuthFetchError("AUTH_INVALID: missing userId");
    }

    const headers = new Headers(options.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }

    const res = await dispatchFetch(resolvedUrl, path, { ...options, headers });
    if (res.status === 401) {
      throw new AuthFetchError("UNAUTHORIZED", 401);
    }
    return res;
  }

  return dispatchFetch(resolvedUrl, path, options);
}
