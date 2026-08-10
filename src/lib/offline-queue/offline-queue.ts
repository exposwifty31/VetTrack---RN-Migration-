/**
 * G4-6 — offline write-queue: capture non-emergency domain writes made while
 * offline, persist them (survives app restart via offline-queue-store.ts),
 * and replay them FIFO when connectivity returns.
 *
 * Frozen doctrine (binding, ported from vettrack `sync-engine.ts` /
 * `emergency-block.ts`): emergency (Code Blue) mutations are NEVER queued.
 * `enqueueOfflineWrite` re-checks the manifest-driven classifier itself
 * (belt-and-suspenders) even though its only production call site —
 * `auth-fetch.ts`'s `dispatchFetch` — already lets the emergency-block
 * check run first and never reaches this function for a blocked endpoint.
 *
 * No polling: replay is triggered externally (AppState foreground / auth
 * signals — see OfflineQueueBridge.tsx), never by an internal timer loop.
 * There is deliberately no pre-flight "isOnline()" check either — matching
 * `emergency-block.ts`'s documented approach, the queue only reacts to an
 * ACTUAL failed dispatch, never guesses connectivity in advance.
 *
 * Concurrency: every mutation (enqueue, per-item patch after a replay
 * attempt) does a fresh read-modify-write by `clientMutationId` immediately
 * before persisting — never operates on a stale snapshot held across an
 * `await` — so a concurrent enqueue() during an in-flight replay fetch can
 * never be clobbered (see offline-queue-store.ts doc).
 */
import * as Crypto from "expo-crypto";
import {
  PENDING_SYNC_MAX_RETRIES,
  PENDING_SYNC_SCHEMA_VERSION,
  type PendingSync,
  type PendingSyncType,
} from "@vettrack/contracts";

import { resolveApiUrl } from "@/lib/api-origin";
import { classifyEmergencyEndpoint } from "@/lib/emergency-block";

import { readQueue, writeQueue } from "./offline-queue-store";

const WRITABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Consecutive-transient-failure threshold that opens the circuit WITHIN one
 * replay pass. Lower than the web sync-engine's desktop threshold (5): on a
 * mobile connection a handful of back-to-back failures already means "still
 * offline" — no value in hammering it before the next foreground trigger.
 */
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 20_000;

export type OfflineQueueEvent =
  | { kind: "enqueued"; item: PendingSync }
  | { kind: "replay_start"; count: number }
  | { kind: "item_success"; item: PendingSync }
  | { kind: "item_retry"; item: PendingSync }
  | { kind: "item_permanent_failure"; item: PendingSync }
  | { kind: "item_owner_mismatch"; item: PendingSync }
  | { kind: "circuit_open"; until: number }
  | { kind: "replay_end" };

type OfflineQueueListener = (event: OfflineQueueEvent) => void;
const listeners = new Set<OfflineQueueListener>();

/** Subscribe to queue lifecycle events (enqueue/replay/permanent-failure). Returns an unsubscribe fn. */
export function subscribeOfflineQueueEvent(listener: OfflineQueueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: OfflineQueueEvent): void {
  for (const listener of listeners) listener(event);
}

function methodToType(method: string): PendingSyncType {
  switch (method) {
    case "POST":
      return "create";
    case "DELETE":
      return "delete";
    case "PUT":
    case "PATCH":
    default:
      return "update";
  }
}

export interface EnqueueOfflineWriteInput {
  endpoint: string;
  method: string;
  body: string;
  /** Override the derived PendingSyncType when the caller knows the domain intent. */
  type?: PendingSyncType;
  equipmentName?: string;
  /**
   * The identity that ISSUED the request. MUST be captured by the caller
   * BEFORE the request was dispatched (see `auth-fetch.ts`'s `authFetch`,
   * which reads `getCurrentUserId()` up front) — never re-derived here at
   * enqueue time, which runs in a `catch` handler after the dispatch has
   * already completed and could observe a DIFFERENT identity if the user
   * signed out/switched accounts while the request was in flight
   * (CodeRabbit PR #51 security finding). `undefined`/`null` means "no
   * identity was captured" (should not happen for a real authenticated
   * write) and such items are permanently held — never auto-replayed under
   * any identity — by `replayOfflineQueue`'s ownership check below.
   */
  userId?: string | null;
  /**
   * Caller-supplied idempotency key (if the original request set one — see
   * `Idempotency-Key` on dispense/task-lifecycle endpoints). Preserved
   * VERBATIM across replay instead of minting a fresh one: if the original
   * request actually reached the server before the client observed the
   * network failure, replaying with a NEW key would execute it again as a
   * distinct operation (e.g. double stock decrement) — CodeRabbit PR #51.
   * A fresh key is minted only when the caller didn't supply one.
   */
  idempotencyKey?: string;
}

/**
 * Capture a non-emergency domain write for later replay. Returns the
 * persisted row, or `null` when the write was refused — either because it
 * targets an emergency endpoint (doctrine guard) or is a non-write method
 * (GET/HEAD) or not an `/api/*` path.
 */
export function enqueueOfflineWrite(input: EnqueueOfflineWriteInput): PendingSync | null {
  const method = input.method.toUpperCase();
  if (!input.endpoint.startsWith("/api/")) return null;
  if (!WRITABLE_METHODS.has(method)) return null;
  if (classifyEmergencyEndpoint(input.endpoint, method)) return null; // frozen doctrine

  const now = Date.now();
  const nowDate = new Date(now);
  const item: PendingSync = {
    type: input.type ?? methodToType(method),
    endpoint: input.endpoint,
    method,
    body: input.body,
    createdAt: nowDate,
    retries: 0,
    status: "pending",
    clientTimestamp: now,
    clientMutationId: Crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey ?? Crypto.randomUUID(),
    schemaVersion: PENDING_SYNC_SCHEMA_VERSION,
    updatedAt: nowDate,
    structuredError: null,
    userId: input.userId ?? undefined,
    equipmentName: input.equipmentName,
  };

  writeQueue([...readQueue(), item]);
  emit({ kind: "enqueued", item });
  return item;
}

/** Read-only snapshot of the persisted queue, in insertion order. For tests/diagnostics. */
export function getOfflineQueueSnapshot(): PendingSync[] {
  return readQueue();
}

function findByClientMutationId(clientMutationId: string): PendingSync | undefined {
  return readQueue().find((i) => i.clientMutationId === clientMutationId);
}

/** Fresh read-modify-write by id — never overwrites the whole array from a stale snapshot. */
function applyPatch(clientMutationId: string, patch: Partial<PendingSync>): void {
  const queue = readQueue();
  const next = queue.map((i) => (i.clientMutationId === clientMutationId ? { ...i, ...patch } : i));
  writeQueue(next);
}

function removeByClientMutationId(clientMutationId: string): void {
  writeQueue(readQueue().filter((i) => i.clientMutationId !== clientMutationId));
}

type AttemptOutcome = "success" | "conflict" | "client_error" | "dead" | "retry_pending";

async function attemptItem(
  item: PendingSync,
  headers: Record<string, string>,
): Promise<{ outcome: AttemptOutcome; patch: Partial<PendingSync> }> {
  const now = new Date();

  try {
    // Raw fetch, not authFetch: replaying through authFetch would re-enter
    // this exact queue (and the emergency classifier) for no benefit — the
    // Authorization header is attached explicitly below instead.
    const res = await fetch(resolveApiUrl(item.endpoint), {
      method: item.method,
      headers,
      body: item.body || undefined,
    });

    if (res.ok) {
      return { outcome: "success", patch: { status: "synced", updatedAt: now } };
    }
    if (res.status === 409) {
      return {
        outcome: "conflict",
        patch: {
          status: "conflict",
          updatedAt: now,
          errorMessage: "Conflict: another change was made to this item",
        },
      };
    }
    // 401 is deliberately EXCLUDED from the terminal 4xx bucket below: it is
    // the most recoverable failure (a missing/stale token, e.g. the
    // OfflineQueueBridge mount racing ClerkTokenBridge's getter install — see
    // RealtimeBridge.tsx's documented cold-start race), not a permanent one.
    // It falls through to the bounded-retry path so a later foreground/
    // auth-"ready" replay (now WITH a valid token) still gets to retry it,
    // instead of the item dying on attempt 1 and being silently skipped
    // forever (replay only re-attempts `pending` rows). Mirrors web
    // `sync-engine.ts`'s dedicated 401 handling — this queue does not adopt
    // its extra session-invalidation side effects, but does adopt "give the
    // token a chance to become valid again" instead of terminating on sight.
    if (res.status >= 400 && res.status < 500 && res.status !== 401) {
      return {
        outcome: "client_error",
        patch: { status: "dead", updatedAt: now, errorMessage: `Request failed: ${res.status}` },
      };
    }
    // 401 and 5xx fall through to the transient/retry path below.
  } catch {
    // Any dispatch failure (network-down, DNS, timeout) is transient during replay.
  }

  const retries = item.retries + 1;
  if (retries >= PENDING_SYNC_MAX_RETRIES) {
    return {
      outcome: "dead",
      patch: {
        status: "dead",
        retries,
        updatedAt: now,
        errorMessage: `Failed after ${PENDING_SYNC_MAX_RETRIES} attempts`,
      },
    };
  }
  return { outcome: "retry_pending", patch: { status: "pending", retries, updatedAt: now } };
}

let replaying = false;
let circuitOpenUntil = 0;

export interface ReplayDeps {
  resolveToken?: () => Promise<string | null>;
  /**
   * The CURRENTLY authenticated identity. Read fresh on every item (not
   * once per pass) so a sign-out/account-switch mid-pass stops binding
   * further items to the old identity from the very next iteration —
   * CodeRabbit PR #51's shared-device security gate. When omitted (or
   * returns `null`), replay holds every owned item — fail-closed, never
   * "no identity check means send anyway".
   */
  getCurrentUserId?: () => string | null;
}

type ReplayLoopState = { consecutiveTransientFailures: number };

/**
 * Persist + emit for one item's replay outcome (extracted from
 * `replayOfflineQueue` to keep its cognitive complexity under the repo's
 * SonarCloud limit — CodeRabbit PR #51 nit). Returns whether this outcome
 * should stop the whole pass (circuit breaker tripped).
 */
function handleReplayOutcome(
  current: PendingSync,
  result: { outcome: AttemptOutcome; patch: Partial<PendingSync> },
  state: ReplayLoopState,
): boolean {
  const patched = { ...current, ...result.patch };

  if (result.outcome === "success") {
    state.consecutiveTransientFailures = 0;
    removeByClientMutationId(current.clientMutationId);
    emit({ kind: "item_success", item: patched });
    return false;
  }
  if (result.outcome === "dead" || result.outcome === "client_error") {
    // Both are permanent give-ups (exhausted retries vs. a terminal 4xx) —
    // subscribers must hear about either, not just the retry-exhaustion
    // path (CodeRabbit PR #51: terminal 4xx was silently missing the event).
    state.consecutiveTransientFailures = 0;
    applyPatch(current.clientMutationId, result.patch);
    emit({ kind: "item_permanent_failure", item: patched });
    return false;
  }
  if (result.outcome === "conflict") {
    state.consecutiveTransientFailures = 0;
    applyPatch(current.clientMutationId, result.patch);
    return false;
  }

  // retry_pending — transient.
  applyPatch(current.clientMutationId, result.patch);
  state.consecutiveTransientFailures++;
  emit({ kind: "item_retry", item: patched });
  if (state.consecutiveTransientFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    emit({ kind: "circuit_open", until: circuitOpenUntil });
    return true;
  }
  return false;
}

/**
 * Replay every `pending` item OWNED BY THE CURRENTLY AUTHENTICATED USER,
 * oldest first. One pass per call — the caller (OfflineQueueBridge) decides
 * WHEN to call this (foreground/auth signals), never a timer inside this
 * module.
 *
 * Ownership gate (CodeRabbit PR #51 — shared clinic device security fix):
 * user A can queue a write offline, sign out, and user B can sign in on the
 * SAME device before the queue replays. Without a check, A's persisted
 * mutation would be sent with B's bearer token — a cross-user, effectively
 * cross-tenant write. Policy (deliberately fail-closed, deliberately
 * "hold", never "drop"):
 *   - `current.userId === activeUserId` → replay normally.
 *   - `current.userId` set but DIFFERENT from the active identity → HELD.
 *     Not attempted, not dead-lettered, not removed — it stays `pending`
 *     and will replay automatically once its owner is active again. A
 *     dropped write is a lost clinical/operational record; a held one
 *     merely waits.
 *   - `current.userId` missing (`null`/`undefined` — should not occur for
 *     any item enqueued after this fix, since `authFetch` always captures
 *     an identity before dispatch) → HELD under every identity,
 *     indefinitely. There is no safe automatic action for an item nobody
 *     can be proven to own; migrating or purging such legacy rows is a
 *     deliberate, separate decision, not an implicit replay.
 * Every hold emits `item_owner_mismatch` so it is observable, not silent.
 */
export async function replayOfflineQueue(deps: ReplayDeps = {}): Promise<void> {
  if (replaying) return;
  if (Date.now() < circuitOpenUntil) return;

  replaying = true;
  try {
    const pending = readQueue()
      .filter((i) => i.status === "pending")
      .sort((a, b) => a.clientTimestamp - b.clientTimestamp);

    if (pending.length === 0) return;
    emit({ kind: "replay_start", count: pending.length });

    const token = deps.resolveToken ? await deps.resolveToken() : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const state: ReplayLoopState = { consecutiveTransientFailures: 0 };

    for (const snapshot of pending) {
      if (Date.now() < circuitOpenUntil) break;

      // Re-read fresh right before acting — see module doc.
      const current = findByClientMutationId(snapshot.clientMutationId);
      if (current?.status !== "pending") continue;

      // Fresh per-item identity read — see ReplayDeps.getCurrentUserId doc.
      const activeUserId = deps.getCurrentUserId ? deps.getCurrentUserId() : null;
      if (!current.userId || current.userId !== activeUserId) {
        emit({ kind: "item_owner_mismatch", item: current });
        continue;
      }

      const itemHeaders = {
        ...headers,
        "Idempotency-Key": current.idempotencyKey,
        "X-Client-Mutation-Id": current.clientMutationId,
      };
      const result = await attemptItem(current, itemHeaders);
      const circuitTripped = handleReplayOutcome(current, result, state);
      if (circuitTripped) break;
    }

    emit({ kind: "replay_end" });
  } finally {
    replaying = false;
  }
}

/** Test-only — reset module-lifetime state (circuit breaker + in-flight guard) between cases. */
export function _resetOfflineQueueForTests(): void {
  replaying = false;
  circuitOpenUntil = 0;
}
