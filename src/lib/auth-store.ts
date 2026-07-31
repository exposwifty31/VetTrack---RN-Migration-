/** Minimal client auth store — bearer fallback + user id for authFetch guards. */

let storedBearerToken: string | null = null;
let currentUserId: string | null = null;

export function getStoredBearerToken(): string | null {
  return storedBearerToken;
}

export function setStoredBearerToken(token: string | null): void {
  storedBearerToken = token;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}
