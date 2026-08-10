/**
 * Code Blue types — mirrors the server response shape for
 * `GET /api/code-blue/sessions/active` (verified read-only against
 * `server/routes/code-blue.ts` + `server/schema/er.ts` on the vettrack repo,
 * 2026-08-10). G4-1 is READ-ONLY: no mutation request/response types live
 * here yet — those arrive with the write-path slice.
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
