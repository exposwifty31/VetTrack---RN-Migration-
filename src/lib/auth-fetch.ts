/**
 * Token-indirection + Bearer authFetch for RN.
 * RN has no cookie jar — Bearer-only (no credentials: "include").
 */

import { resolveApiUrl } from "@/lib/api-origin";
import {
  bumpIdentityRevision,
  getCurrentUserId,
  getIdentityRevision,
  getStoredBearerToken,
} from "@/lib/auth-store";
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
  // Bump directly here — do NOT rely on a listener (e.g. useIdentity.ts)
  // reacting to notifyAuthChange to eventually call setCurrentUserId. A
  // security-critical revision check (resolveAuthSnapshot below) must stay
  // correct even if no such listener is mounted yet.
  bumpIdentityRevision();
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

export interface AuthSnapshot {
  userId: string | null;
  /** Never empty — see `resolveAuthSnapshot`: a token-less result is `null`, not a snapshot with a falsy token. */
  token: string;
  /** The identity-revision this snapshot was captured at — informational for callers. */
  revision: number;
}

/**
 * Atomically resolve `{userId, token}` as ONE snapshot from the SAME
 * identity generation — CodeRabbit PR #51's critical fix.
 *
 * `resolveToken()` can await real async work (Clerk's `getToken()` reading a
 * keychain/network), during which a sign-out or account switch can land.
 * Reading `userId` before vs. after that await INDEPENDENTLY (as the round-1
 * fix did — token resolved once per replay pass, userId re-read per item)
 * risks pairing a token from one identity with a userId — and therefore a
 * queued write's ownership stamp, or an outgoing request's Authorization
 * header — from a different one.
 *
 * This function captures `userId` BEFORE the token-resolution await, then
 * re-checks the monotonic identity-revision counter (`auth-store.ts`) AFTER
 * it — if the revision moved, the snapshot spans two different identity
 * generations and is returned as `null` rather than a best-effort guess.
 * There is no separate "revalidate before dispatch" step needed on top of
 * this: every caller (authFetch's own dispatch path below, and the
 * offline-queue replay loop via `OfflineQueueBridge`) uses the returned
 * snapshot synchronously — no further `await` occurs between resolving it
 * and using both of its fields together, so no additional TOCTOU window
 * exists downstream of a non-null result.
 *
 * Callers MUST treat `null` as "nothing is safe to send right now" — never
 * fall back to a partial/mixed read of the current live state.
 *
 * A snapshot with no token is likewise NOT a valid snapshot (CodeRabbit PR
 * #51 round 3 major finding): a token-less result would let a caller
 * "match" on `userId` alone and go on to send a request — or replay a
 * queued write — with no `Authorization` header at all. Absent-token gets
 * the exact same fail-closed treatment as an identity mismatch: `null`.
 */
export async function resolveAuthSnapshot(): Promise<AuthSnapshot | null> {
  const revisionBefore = getIdentityRevision();
  const userIdBefore = getCurrentUserId();
  const token = await resolveToken();
  if (!token || getIdentityRevision() !== revisionBefore) {
    return null; // no token, or identity moved during token resolution
  }
  return { userId: userIdBefore, token, revision: revisionBefore };
}

function extractIdempotencyKey(headers: RequestInit["headers"]): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get("Idempotency-Key") ?? undefined;
  if (Array.isArray(headers)) {
    return headers.find(([k]) => k.toLowerCase() === "idempotency-key")?.[1];
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === "idempotency-key");
  return key ? record[key] : undefined;
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
 *
 * `capturedUserId` is the identity `authFetch` resolved BEFORE dispatching
 * (via the atomic `resolveAuthSnapshot()` above) — NOT re-derived here. This
 * closes a race CodeRabbit flagged on PR #51: if `getCurrentUserId()` were
 * read fresh in this `catch` handler (which runs AFTER the network call has
 * already completed/failed), a sign-out or account switch that happened
 * WHILE the request was in flight could stamp the wrong owner on the queued
 * item. The identity captured at dispatch time is the only one that can be
 * correct, regardless of what changes later.
 *
 * Only `null`/`undefined`/string bodies are ever queued (CodeRabbit PR #51
 * major finding): `RequestInit.body` can also be a `FormData`,
 * `URLSearchParams`, `Blob`, or `ArrayBuffer` — none of which this queue can
 * durably serialize today. Coercing one of those to `""` would silently
 * replay the mutation with an EMPTY body instead of the real one. There is
 * no safe codec for them yet, so such a write is simply never captured for
 * offline replay — the original network error still propagates unchanged
 * (same as every other non-enqueued case), it just isn't queued.
 */
async function dispatchFetch(
  resolvedUrl: string,
  path: string,
  init: RequestInit,
  capturedUserId: string | null,
): Promise<Response> {
  try {
    return await fetch(resolvedUrl, init);
  } catch (err) {
    const blocked = emergencyOfflineErrorFromFailedDispatch(err, path, init.method ?? "GET");
    if (blocked) throw blocked;
    const body = init.body;
    const bodyIsQueueable = body === undefined || body === null || typeof body === "string";
    if (isNetworkFailure(err) && bodyIsQueueable) {
      enqueueOfflineWrite({
        endpoint: path,
        method: init.method ?? "GET",
        body: typeof body === "string" ? body : "",
        userId: capturedUserId,
        idempotencyKey: extractIdempotencyKey(init.headers),
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
    // Atomic snapshot (CodeRabbit PR #51 critical fix) — token and userId
    // MUST come from the same identity generation; see resolveAuthSnapshot's
    // doc for why a sequential resolveToken()-then-getCurrentUserId() read
    // (the pre-fix shape) is unsafe.
    const snapshot = await resolveAuthSnapshot();
    if (!snapshot || !isValidJwt(snapshot.token)) {
      throw new AuthFetchError("AUTH_INVALID: invalid token");
    }

    // Bootstrap: /api/users/me may run before setCurrentUserId; other routes require it.
    const userId = snapshot.userId?.trim();
    if (!userId && path !== "/api/users/me") {
      throw new AuthFetchError("AUTH_INVALID: missing userId");
    }

    const headers = new Headers(options.headers ?? {});
    headers.set("Authorization", `Bearer ${snapshot.token}`);
    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }

    const res = await dispatchFetch(resolvedUrl, path, { ...options, headers }, userId ?? null);
    if (res.status === 401) {
      throw new AuthFetchError("UNAUTHORIZED", 401);
    }
    return res;
  }

  return dispatchFetch(resolvedUrl, path, options, null);
}
