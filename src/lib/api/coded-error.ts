/**
 * Shared coded-error plumbing for the per-domain API modules under
 * `src/lib/api/` (G3-PLAN §2 rule 3). Mirrors the TasksApiError idiom from
 * `tasks.ts` (which stays self-contained — refactoring it is out of scope):
 * every non-OK response surfaces `{status, code}` so screens branch on the
 * stable server code, never on copy.
 */
import { authFetch } from "@/lib/auth-fetch";

/** Coded API error — `code` is the server's apiError envelope code/reason. */
export class ApiCodedError extends Error {
  readonly status: number;
  readonly code: string;
  /** The envelope's `reason` field when present (finer-grained than `code`). */
  readonly reason: string | null;
  /**
   * The envelope's `details` object when present (server apiError metadata,
   * e.g. `{currentSeniorName}` on 409 SENIOR_ALREADY_ASSIGNED). Untyped here;
   * domain modules narrow it (see `readSeniorConflict`).
   */
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    reason?: string | null,
    message?: string,
    details?: unknown,
  ) {
    super(message ?? `${code} (HTTP ${status})`);
    this.name = "ApiCodedError";
    this.status = status;
    this.code = code;
    this.reason = reason ?? null;
    this.details = details;
  }
}

/** Query retry policy: default-retry parity (retry: 1) minus pointless 4xx retries. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiCodedError && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * authFetch + JSON unwrap with coded-error normalization. A JSON `null` or
 * non-object error body still surfaces a coded ApiCodedError, never a
 * TypeError (the tasks.ts normalization, shared).
 */
export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const payload: unknown = await res.json().catch(() => ({}));
    const body =
      payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const code =
      typeof body.code === "string"
        ? body.code
        : typeof body.error === "string"
          ? body.error
          : `HTTP_${res.status}`;
    const reason = typeof body.reason === "string" ? body.reason : null;
    const message = typeof body.message === "string" ? body.message : undefined;
    throw new ApiCodedError(res.status, code, reason, message, body.details);
  }
  return (await res.json()) as T;
}
