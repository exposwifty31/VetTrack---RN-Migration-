/**
 * Token-indirection + Bearer authFetch for RN.
 * RN has no cookie jar — Bearer-only (no credentials: "include").
 */

import { resolveApiUrl } from "@/lib/api-origin";
import { getCurrentUserId, getStoredBearerToken } from "@/lib/auth-store";

type ClerkTokenGetter = (() => Promise<string | null>) | null;

let clerkTokenGetter: ClerkTokenGetter = null;

export function setClerkTokenGetter(getter: ClerkTokenGetter): void {
  clerkTokenGetter = getter;
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

    const res = await fetch(resolvedUrl, { ...options, headers });
    if (res.status === 401) {
      throw new AuthFetchError("UNAUTHORIZED", 401);
    }
    return res;
  }

  return fetch(resolvedUrl, options);
}
