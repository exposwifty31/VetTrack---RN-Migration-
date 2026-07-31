function trimTrailingSlash(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Absolute API origin for RN (always required on device). */
export function getConfiguredApiOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_ORIGIN?.trim();
  return raw ? trimTrailingSlash(raw) : null;
}

/**
 * Resolve `/api/...` to an absolute URL using EXPO_PUBLIC_API_ORIGIN.
 * Absolute inputs are returned unchanged.
 */
export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  const configured = getConfiguredApiOrigin();
  if (!configured) {
    throw new Error(
      "EXPO_PUBLIC_API_ORIGIN is required for API calls on React Native (set in .env)",
    );
  }
  return `${configured}${path}`;
}
