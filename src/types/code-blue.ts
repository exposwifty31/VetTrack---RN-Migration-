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

/**
 * `POST /api/code-blue/one-tap` — the R-CBF-1.1 orchestrated start. Mirrors
 * `oneTapStartSchema` (server/routes/code-blue.ts, `.strict()`), verified
 * read-only 2026-08-18.
 *
 * WHY THIS AND NOT `POST /sessions`: `/sessions` has NO idempotency — its only
 * guard is a per-clinic advisory lock, so a start that COMMITTED but whose
 * response was lost returns a 409 `ACTIVE_SESSION_EXISTS` indistinguishable
 * from "someone else beat you". One-tap fences on a durable
 * `vt_code_blue_start_claims` row keyed by `(clinicId, idempotencyToken)`, and
 * additionally: picks the nearest ready crash cart server-side, CAS-reserves
 * it, and commits the claim in the SAME transaction as the session insert.
 *
 * `locationHint` is deliberately NOT sent by this client: the server re-derives
 * the initiating room itself and only ever uses a client hint to flag a
 * mismatch — it never steers cart selection. Sending a guess would add risk
 * for no gain. `StartCodeBlueRequest` above is retained for the future
 * equipment-initiated start (`equipmentId`), which one-tap has no field for.
 */
export type OneTapStartRequest = Readonly<{
  /** Fence key. Minted once per start gesture, re-sent verbatim on retry. */
  idempotencyToken: string;
  managerUserId: string;
  managerUserName: string;
  preCheckPassed?: boolean;
  locationHint?: Readonly<{ roomId: string | null }>;
}>;

/** Durable paging-outbox state echoed back by one-tap (never a static "sent"). */
export type OneTapPagingState = "queued" | "processing" | "sent" | "failed";

/**
 * 201 `{ outcome: "created", sessionId, reservedCartId, pagingState }` on a
 * fresh start; 200 `{ outcome: "replay", sessionId, pagingState }` when the
 * fence recognises an already-committed claim. `reservedCartId: null` IS the
 * "no ready cart" signal — the session still starts (soft-reserve is advisory).
 */
export type OneTapStartResponse = Readonly<{
  outcome: "created" | "replay";
  sessionId: string;
  reservedCartId?: string | null;
  pagingState?: OneTapPagingState | null;
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
