/**
 * Token-indirection seam for authenticated fetch (Slice 4 fills in authFetch).
 * Mirrors vettrack `setClerkTokenGetter` — Clerk wiring injects; API client reads.
 */

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
  // Jest/node without atob — decode via globalThis.Buffer when present.
  const Buf = (globalThis as { Buffer?: { from(data: string, enc: string): { toString(enc: string): string } } })
    .Buffer;
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

export async function resolveToken(): Promise<string | null> {
  if (clerkTokenGetter) {
    const token = await clerkTokenGetter();
    return typeof token === "string" ? token.trim() : null;
  }
  return null;
}
