/**
 * Pure accumulation for the shift-chat `?after=` incremental poll (G3 Slice 8).
 *
 * The transport is gt-poll: each poll returns only messages newer than the
 * cursor, plus a FRESH presence/pin snapshot (server queries `pinnedMessage`,
 * `typing`, `onlineUserIds` independently of `after`). These helpers fold an
 * incremental snapshot into the accumulated one:
 *   - messages: append + dedupe by id (incoming wins), chronological order;
 *   - presence/pin: REPLACE with the incoming snapshot every poll, even when
 *     the incremental batch carried zero new messages;
 *   - window rollover: when `shiftSessionId` changes (or there was no prior
 *     snapshot), REPLACE wholesale — accumulated rows belong to the old window.
 *
 * Deliberately free of i18n/datetime/React imports so its unit test needs no
 * `safe-storage` mock and never drags Reanimated into jest (the
 * equipment-row-status precedent).
 */
import { EMPTY_WINDOW_SNAPSHOT } from "@/lib/api/shift-chat";
import type {
  AckStatus,
  ReactionEmoji,
  ShiftChatSnapshot,
  ShiftMessage,
} from "@/lib/api/shift-chat";

/** Epoch ms for an ISO timestamp, or -Infinity when unparseable (sorts first). */
function epoch(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/** Chronological compare (createdAt asc, id as a stable tiebreaker). */
function byCreatedThenId(a: ShiftMessage, b: ShiftMessage): number {
  const ta = epoch(a.createdAt);
  const tb = epoch(b.createdAt);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Append + dedupe by id; incoming rows win (a re-delivered row carries the
 * fresher acks/reactions). Returns a new, chronologically-sorted array.
 */
export function mergeMessages(
  prev: readonly ShiftMessage[],
  incoming: readonly ShiftMessage[],
): ShiftMessage[] {
  const byId = new Map<string, ShiftMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(byCreatedThenId);
}

/**
 * The cursor for the NEXT `?after=` poll: the newest accumulated `createdAt`.
 * Undefined when there are no messages (→ the next poll refetches the full
 * window, which is correct and cheap for an empty window).
 */
export function latestCursor(messages: readonly ShiftMessage[]): string | undefined {
  let best: string | undefined;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const m of messages) {
    const ms = epoch(m.createdAt);
    if (ms > bestMs) {
      bestMs = ms;
      best = m.createdAt;
    }
  }
  return best;
}

/**
 * Fold an incremental snapshot into the accumulated one. On the first snapshot,
 * or when the window id changes, the incoming snapshot fully replaces the prior
 * accumulation (its rows belong to a different window). Otherwise messages are
 * merged and presence/pin are taken fresh from `incoming`.
 */
export function mergeSnapshot(
  prev: ShiftChatSnapshot | undefined,
  incoming: ShiftChatSnapshot,
): ShiftChatSnapshot {
  if (!prev || prev.shiftSessionId !== incoming.shiftSessionId) {
    return incoming;
  }
  return {
    ...incoming,
    messages: mergeMessages(prev.messages, incoming.messages),
  };
}

/**
 * The cursor to send on the NEXT poll for a given accumulated snapshot. A
 * null-window snapshot (off-window / no active shift) yields undefined so the
 * next poll refetches the full window — the recovery path when a shift starts
 * while the screen is open.
 */
export function cursorFor(snapshot: ShiftChatSnapshot | undefined): string | undefined {
  if (!snapshot || snapshot.shiftSessionId == null) return undefined;
  return latestCursor(snapshot.messages);
}

// ── Optimistic own-action patches ────────────────────────────────────────────
// The `?after=` model never re-delivers acks/reactions on already-fetched
// (older-than-cursor) rows, so the caller's OWN actions are reflected
// optimistically; the server remains the source of truth and a later full
// refetch reconciles others' actions. All pure, all returning new objects.

function patchMessageById(
  snapshot: ShiftChatSnapshot,
  messageId: string,
  patch: (m: ShiftMessage) => ShiftMessage,
): ShiftChatSnapshot {
  const apply = (m: ShiftMessage): ShiftMessage => (m.id === messageId ? patch(m) : m);
  return {
    ...snapshot,
    messages: snapshot.messages.map(apply),
    pinnedMessage: snapshot.pinnedMessage ? apply(snapshot.pinnedMessage) : null,
  };
}

/** Insert the caller's just-sent message (dedupe-safe against the next poll). */
export function applyOwnMessage(
  snapshot: ShiftChatSnapshot | undefined,
  message: ShiftMessage,
): ShiftChatSnapshot {
  const base = snapshot ?? EMPTY_WINDOW_SNAPSHOT;
  return { ...base, messages: mergeMessages(base.messages, [message]) };
}

/** Set the caller's ack on a broadcast/system message. */
export function applyOwnAck(
  snapshot: ShiftChatSnapshot,
  messageId: string,
  userId: string,
  status: AckStatus,
): ShiftChatSnapshot {
  return patchMessageById(snapshot, messageId, (m) => {
    const others = m.acks.filter((a) => a.userId !== userId);
    return { ...m, acks: [...others, { userId, status }] };
  });
}

/** Toggle the caller's reaction per the server's `{action}` result. */
export function applyOwnReaction(
  snapshot: ShiftChatSnapshot,
  messageId: string,
  userId: string,
  emoji: ReactionEmoji,
  action: "added" | "removed",
): ShiftChatSnapshot {
  return patchMessageById(snapshot, messageId, (m) => {
    const others = m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
    return {
      ...m,
      reactions: action === "added" ? [...others, { userId, emoji }] : others,
    };
  });
}
