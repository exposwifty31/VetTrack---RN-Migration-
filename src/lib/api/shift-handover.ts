/**
 * Shift-handover API module (G3 Slice 9) — per-domain module per G3-PLAN §2
 * rule 3 (new domains never grow `api.ts`; each ships its own key factory +
 * typed fns on the shared coded-error plumbing).
 *
 * Server truth (verified 2026-08-08 against server/routes/shift-handover.ts,
 * server/services/shift-handover.service.ts, server/lib/shift-handover.ts and
 * server/lib/apiError.ts — read-only):
 *   - GET    /api/shift-handover/current          → { handover: Artifact | null }
 *   - POST   /api/shift-handover/:id/acknowledge  → { handover: Artifact }
 *   - DELETE /api/shift-handover/:id/acknowledge  → { handover: Artifact }
 *   All three are plain `requireAuth`; `clinicId` is derived server-side and is
 *   NEVER sent. There is NO generate route — generation is scheduler-only
 *   (frozen R-SH-F1), so this module ships no generate call.
 *
 *   The GET read succeeds for any clinic user, but the two mutations are
 *   next-shift-roster authorized server-side: a non-roster caller who can OPEN
 *   the document still gets 403 `{code:"errors.authority.denied"}`
 *   (ShiftHandoverAccessError). 404 `{code:"errors.notFound"}` if the id went
 *   stale. Errors ride the apiError envelope `{error, code}` (no `reason`
 *   field) → surfaced as ApiCodedError so the screen branches on status/code.
 */
import * as Crypto from "expo-crypto";

import { ApiCodedError, requestJson } from "@/lib/api/coded-error";

/** Canonical shift-handover query-key factory — everything nests under `all`. */
export const shiftHandoverKeys = {
  all: ["shiftHandover"] as const,
  current: () => ["shiftHandover", "current"] as const,
};

/** Closed set of safe worklist error codes (server/lib/shift-handover.ts). */
export type PatientWorklistErrorCode =
  | "unreachable"
  | "auth_failed"
  | "timeout"
  | "malformed"
  | "unknown";

export type PatientWorklistEntry = Readonly<{
  /** External PMS animal id (guaranteed-Latin → writingDirection ltr on render). */
  externalId: string;
  /** External PMS label (arbitrary content — flows with layout direction). */
  display: string;
  /** Internal vt_users.id of the tech who worked the animal (resolves via `staff`). */
  byTechId: string;
}>;

/**
 * Discriminated union — a PMS failure can never read as an empty/ready
 * worklist (mirrors the server `patientWorklistSchema`).
 */
export type PatientWorklist =
  | { state: "not_configured" }
  | { state: "ready"; entries: PatientWorklistEntry[] }
  | { state: "error"; code: PatientWorklistErrorCode };

export type HandoverDeltaEntry = Readonly<{
  sourceId: string;
  kind: string;
  targetId: string | null;
  targetType: string | null;
  at: string;
}>;

/** The four locked delta dimensions (owner): custody, task-state, alerts, dispenses. */
export type HandoverDeltas = Readonly<{
  custody: HandoverDeltaEntry[];
  taskState: HandoverDeltaEntry[];
  alerts: HandoverDeltaEntry[];
  dispenses: HandoverDeltaEntry[];
}>;

export type HandoverOpenItem = Readonly<{
  id: string;
  kind: string;
  /** Human-readable carry-over summary (the meat — rendered in full). */
  summary: string;
}>;

export type HandoverObservedSignal = Readonly<{
  sourceId: string;
  kind: string;
  at: string;
}>;

/** A worklist tech resolved to a clinic-scoped display name (server-joined). */
export type HandoverStaff = Readonly<{ userId: string; name: string }>;

/** The `/handoff` wire artifact (server SerializedHandoverArtifact). */
export type HandoverArtifact = Readonly<{
  id: string;
  shiftSessionId: string;
  revision: number;
  deltas: HandoverDeltas;
  openItems: HandoverOpenItem[];
  observedSignals: HandoverObservedSignal[];
  patientWorklist: PatientWorklist;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  notificationReadAt: string | null;
  generatedAt: string;
  staff: HandoverStaff[];
}>;

/**
 * The roster-authorization signal for the two mutations: server-side
 * ShiftHandoverAccessError → 403 `{code:"errors.authority.denied"}`. It CANNOT
 * be pre-gated — the read succeeds for any clinic user, the artifact carries no
 * "may I ack" flag, and authorization is roster- not role-based (so
 * `hasRoleAtLeast` does not apply). The screen maps it reactively to an inline
 * note. We match on BOTH status 403 AND the exact code (`errors.authority.denied`)
 * so an unrelated coded 403 can never borrow the roster-specific copy; the
 * acknowledge route emits exactly this code, asserted in the module test.
 */
export function isHandoverForbiddenError(error: unknown): boolean {
  return (
    error instanceof ApiCodedError &&
    error.status === 403 &&
    error.code === "errors.authority.denied"
  );
}

/** One fresh trace id per mutation attempt (the established scan/adjustment idiom). */
function mutationHeaders(): Record<string, string> {
  return { "x-request-id": Crypto.randomUUID() };
}

export const shiftHandoverApi = {
  /** GET /api/shift-handover/current — the latest artifact, or null if none generated yet. */
  getCurrent: async (): Promise<HandoverArtifact | null> => {
    const body = await requestJson<{ handover: HandoverArtifact | null }>(
      "/api/shift-handover/current",
    );
    return body.handover;
  },

  /** POST /api/shift-handover/:id/acknowledge — attest read; returns the updated artifact. */
  acknowledge: async (id: string): Promise<HandoverArtifact> => {
    const body = await requestJson<{ handover: HandoverArtifact }>(
      `/api/shift-handover/${encodeURIComponent(id)}/acknowledge`,
      { method: "POST", headers: mutationHeaders() },
    );
    return body.handover;
  },

  /** DELETE /api/shift-handover/:id/acknowledge — persisted unconfirm; returns the updated artifact. */
  unconfirm: async (id: string): Promise<HandoverArtifact> => {
    const body = await requestJson<{ handover: HandoverArtifact }>(
      `/api/shift-handover/${encodeURIComponent(id)}/acknowledge`,
      { method: "DELETE", headers: mutationHeaders() },
    );
    return body.handover;
  },
};
