/**
 * Clinical check-in API module (doctor shift gate) — per-domain module on the
 * shared coded-error `requestJson` helper, same shape as `shift-adjustments.ts`.
 *
 * Server truth (verified 2026-08-13 against vettrack feat/doctor-shift-gate:
 * server/routes/clinical-check-in.ts + server/services/clinical-check-in.ts +
 * src/types/check-in.ts, read-only):
 *   - POST /api/clinical-check-in/check-in and POST /api/clinical-check-in/switch
 *     (atomic close+open) share the body
 *     `{operationalRole, isSenior?, replaceSenior?, source?: "doctor_gate"}`.
 *     The gate MUST send `source: "doctor_gate"` on BOTH — it stamps immutable
 *     provenance (`check_in_source`) that the 14h auto-expiry worker filters
 *     on; without it an allowlisted-admission vet's row never expires. It
 *     controls expiry semantics only, never privileges. Both accept an
 *     optional Idempotency-Key header (≤64 chars).
 *   - POST /api/clinical-check-in/check-out → the closed row.
 *   - GET /api/clinical-check-in/me/active → `{active: row | null}`.
 *   - Coded errors: SENIOR_NOT_ELIGIBLE (403), SENIOR_REQUIRES_TEAM_ROLE (422),
 *     SENIOR_ALREADY_ASSIGNED (409, `details.currentSeniorName: string | null`
 *     — MAY be null on the race path), ROLE_NOT_ELIGIBLE_FOR_CHECK_IN.
 *
 * The vendored legacy `doctor-operational-shift` enum (`admission|ward|…`) is
 * deliberately NOT imported — the gate's team taxonomy is the server's
 * `icu|admission|internal_medicine`.
 */
import * as Crypto from "expo-crypto";

import { requestJson } from "@/lib/api/coded-error";

/** Canonical clinical-check-in query-key factory — everything nests under `all`. */
export const clinicalCheckInKeys = {
  all: ["clinical-check-in"] as const,
  active: ["clinical-check-in", "active"] as const,
};

/** The doctor-gate team taxonomy (server `shared/doctor-teams`), NOT the legacy enum. */
export type DoctorTeamRole = "icu" | "admission" | "internal_medicine";

/** Mirror of the server's `serializeCheckIn` row. */
export type CheckInRow = Readonly<{
  id: string;
  clinicId: string;
  userId: string;
  operationalRole: string | null;
  isSenior: boolean;
  clinicalRoleAtCheckIn: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  checkOutReason: string | null;
}>;

/** Response envelope of GET /api/clinical-check-in/me/active. */
export type ActiveCheckInResponse = Readonly<{ active: CheckInRow | null }>;

export type OpenCheckInInput = Readonly<{
  operationalRole: DoctorTeamRole;
  isSenior?: boolean;
  /** Retry-after-409 confirmation: demote the current senior and take over. */
  replaceSenior?: boolean;
}>;

type MutationOptions = Readonly<{
  /** Optional server-side dedupe key (≤64 chars) reused across retries of ONE intent. */
  idempotencyKey?: string;
}>;

/** 409 code when another senior already holds the requested team. */
export const SENIOR_ALREADY_ASSIGNED = "SENIOR_ALREADY_ASSIGNED";

export type SeniorConflict = Readonly<{ currentSeniorName: string | null }>;

/**
 * Narrow a check-in/switch mutation error to the SENIOR_ALREADY_ASSIGNED
 * conflict (409 with `details.currentSeniorName`, which MAY be null on the
 * race path — the confirm dialog needs a generic fallback message then).
 * Returns null for every other error.
 */
export function readSeniorConflict(err: unknown): SeniorConflict | null {
  if (typeof err !== "object" || err === null) return null;
  if ((err as { code?: unknown }).code !== SENIOR_ALREADY_ASSIGNED) return null;
  const details = (err as { details?: unknown }).details;
  const name =
    typeof details === "object" && details !== null
      ? (details as Record<string, unknown>).currentSeniorName
      : undefined;
  return { currentSeniorName: typeof name === "string" ? name : null };
}

function mutationHeaders(options?: MutationOptions): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-request-id": Crypto.randomUUID(),
    ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
  };
}

/** Gate-declared provenance stamp — REQUIRED on both open and switch (see header). */
function gateBody(input: OpenCheckInInput): string {
  return JSON.stringify({ ...input, source: "doctor_gate" });
}

export const clinicalCheckInApi = {
  /** GET /api/clinical-check-in/me/active — the caller's open row, if any. */
  active: async (): Promise<ActiveCheckInResponse> =>
    requestJson<ActiveCheckInResponse>("/api/clinical-check-in/me/active"),

  /** POST /api/clinical-check-in/check-in — open a doctor-gate check-in. */
  open: async (input: OpenCheckInInput, options?: MutationOptions): Promise<CheckInRow> =>
    requestJson<CheckInRow>("/api/clinical-check-in/check-in", {
      method: "POST",
      headers: mutationHeaders(options),
      body: gateBody(input),
    }),

  /** POST /api/clinical-check-in/switch — atomic close+open onto a new team. */
  switchRole: async (input: OpenCheckInInput, options?: MutationOptions): Promise<CheckInRow> =>
    requestJson<CheckInRow>("/api/clinical-check-in/switch", {
      method: "POST",
      headers: mutationHeaders(options),
      body: gateBody(input),
    }),

  /** POST /api/clinical-check-in/check-out — close the caller's open row. */
  close: async (): Promise<CheckInRow> =>
    requestJson<CheckInRow>("/api/clinical-check-in/check-out", {
      method: "POST",
      headers: { "x-request-id": Crypto.randomUUID() },
    }),
};
