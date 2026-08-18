/**
 * Code Blue types — mirrors the server response shape for
 * `GET /api/code-blue/sessions/active` (verified read-only against
 * `server/routes/code-blue.ts` + `server/schema/er.ts` on the vettrack repo,
 * 2026-08-10). G4-5 adds the mutation request/response types below, verified
 * read-only against the same file's `startSessionSchema` / `logEntrySchema` /
 * `endSessionSchema` and their route handlers (2026-08-10).
 */

export type CodeBlueSessionStatus = "active" | "ended";
export type CodeBlueSessionOutcome = "rosc" | "died" | "transferred" | "ongoing";
export type CodeBlueLogCategory = "equipment" | "note";

/** `vt_code_blue_sessions` row. The active-session endpoint only ever returns status "active". */
export type CodeBlueSession = Readonly<{
  id: string;
  clinicId: string;
  startedAt: string;
  startedBy: string;
  startedByName: string;
  managerUserId: string;
  managerUserName: string;
  status: CodeBlueSessionStatus;
  outcome: CodeBlueSessionOutcome | null;
  preCheckPassed: boolean | null;
  endedAt: string | null;
  createdAt: string;
  isReconciled: boolean;
  reconciledAt: string | null;
  reconciledByUserId: string | null;
}>;

/** `vt_code_blue_log_entries` row, ordered by `elapsedMs` server-side. */
export type CodeBlueLogEntry = Readonly<{
  id: string;
  sessionId: string;
  clinicId: string;
  idempotencyKey: string;
  elapsedMs: number;
  label: string;
  category: CodeBlueLogCategory;
  equipmentId: string | null;
  loggedByUserId: string;
  loggedByName: string;
  createdAt: string;
}>;

/** `vt_code_blue_presence` row — server pre-filters to `lastSeenAt` within 30s. */
export type CodeBluePresenceRow = Readonly<{
  sessionId: string;
  userId: string;
  userName: string;
  lastSeenAt: string;
}>;

/** Nullability lives at each use site (the field/param type), not baked into the alias. */
export type CodeBlueCartStatus = Readonly<{
  lastCheckedAt: string;
  allPassed: boolean;
  performedByName: string;
}>;

/**
 * GET /api/code-blue/sessions/active response body. `linkedEquipment` shape is
 * owned by `fetchLinkedEquipmentForSession` server-side; not consumed by the
 * G4-1 read-only viewer, kept opaque here rather than guessed.
 */
export type ActiveCodeBlueResponse = Readonly<{
  session: CodeBlueSession | null;
  logEntries: readonly CodeBlueLogEntry[];
  presence: readonly CodeBluePresenceRow[];
  cartStatus: CodeBlueCartStatus | null;
  linkedEquipment: readonly unknown[];
}>;

/**
 * One row of GET /api/users/managers — a candidate for `managerUserId`.
 * Server select list is exactly `{ id, name, role }` (server/routes/users.ts:1189).
 * `role` is the PERMANENT `vt_users.role` and is always "vet" or "admin" by
 * the route's own filter; kept on the type so the picker can label the row
 * without a second lookup.
 */
export type CodeBlueManager = Readonly<{
  id: string;
  name: string;
  role: string;
}>;

/** POST /api/code-blue/sessions body — mirrors `startSessionSchema`. */
export type StartCodeBlueRequest = Readonly<{
  managerUserId: string;
  managerUserName: string;
  preCheckPassed?: boolean;
  localStartedAt?: string;
  equipmentId?: string;
}>;

/** POST /api/code-blue/sessions response — `{ id, startedAt }` (route handler). */
export type StartCodeBlueResponse = Readonly<{
  id: string;
  startedAt: string;
}>;

/** POST /api/code-blue/sessions/:id/logs body — mirrors `logEntrySchema`. */
export type LogEntryRequest = Readonly<{
  idempotencyKey: string;
  elapsedMs: number;
  label: string;
  category: CodeBlueLogCategory;
  equipmentId?: string;
}>;

/** POST /api/code-blue/sessions/:id/logs response — `{ id, duplicate }`. */
export type LogEntryResponse = Readonly<{
  id: string;
  duplicate: boolean;
}>;

/** PATCH /api/code-blue/sessions/:id/end body — mirrors `endSessionSchema`. */
export type EndSessionRequest = Readonly<{
  outcome: CodeBlueSessionOutcome;
  earlyStopReason?: string;
}>;

/** PATCH /api/code-blue/sessions/:id/end response — `{ id, endedAt, summary }`. `summary` is opaque JSON, not consumed client-side. */
export type EndSessionResponse = Readonly<{
  id: string;
  endedAt: string;
  summary: unknown;
}>;

/** PATCH /api/code-blue/sessions/:id/presence response — `{ ok: true }`. No request body. */
export type PresenceResponse = Readonly<{
  ok: boolean;
}>;
