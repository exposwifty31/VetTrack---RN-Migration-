/**
 * Nudges API module (G3 Slice 5) — seam §6.6 pre-resolved positive.
 *
 * Server truth (verified 2026-08-07 against server/routes/nudges.ts +
 * server/services/nudge-feed.service.ts, read-only): GET /api/nudges
 * (requireAuth) → `{nudges}`. Compute-on-read, already filtered server-side to
 * the caller's role (`targetRole === authUser.role`); kinds are a closed
 * `"expiry" | "restock"` enum. No dedicated domain events — the inputs are
 * equipment expiry rows + container stock, so EQUIPMENT_* domain events and
 * dispense/restock audit rows are the practical freshness signals.
 */
import { requestJson } from "@/lib/api/coded-error";

/** Canonical nudges query-key factory — everything nests under `all`. */
export const nudgeKeys = {
  all: ["nudges"] as const,
  list: () => ["nudges", "list"] as const,
};

export type NudgeKind = "expiry" | "restock";

export type Nudge = Readonly<{
  id: string;
  kind: NudgeKind;
  targetRole: string;
  entityId: string;
  message?: string;
  createdAt: string;
}>;

export const nudgesApi = {
  /** GET /api/nudges — the caller's role-scoped nudge feed. */
  list: async (): Promise<Nudge[]> => {
    const body = await requestJson<{ nudges: Nudge[] }>("/api/nudges");
    return body.nudges;
  },
};
