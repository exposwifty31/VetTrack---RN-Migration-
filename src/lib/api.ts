import { authFetch } from "@/lib/auth-fetch";
import { setCurrentUserId } from "@/lib/auth-store";
import type { MeUser, OutboxHead, QuickScanToggleResult } from "@/types/api";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status} for ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Grow per slice — start with endpoints needed by G1 foundation. */
export const api = {
  users: {
    me: async (): Promise<MeUser> => {
      const me = await requestJson<MeUser>("/api/users/me");
      if (me.id) setCurrentUserId(me.id);
      return me;
    },
  },
  realtime: {
    outboxHead: () => requestJson<OutboxHead>("/api/realtime/outbox-head"),
    replay: (afterId: number, limit = 100) =>
      requestJson<{ events: unknown[] }>(
        `/api/realtime/replay?afterId=${encodeURIComponent(String(afterId))}&limit=${limit}`,
      ),
  },
  equipment: {
    quickToggle: (equipmentId: string) =>
      requestJson<QuickScanToggleResult>(`/api/equipment/${equipmentId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ isPluggedIn: true }),
      }),
  },
};
