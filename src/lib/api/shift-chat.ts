/**
 * Shift-chat API module (G3 Slice 8) — per-domain module per G3-PLAN §2 rule 3
 * (new domains never grow `api.ts`; each ships its own key factory + typed fns).
 * Reuses the shared coded-error plumbing (`requestJson`/`ApiCodedError`) instead
 * of re-rolling a per-domain error class — the tasks.ts idiom, generalized.
 *
 * Server truth (verified 2026-08-07 against the vettrack repo, read-only —
 * `server/routes/shift-chat.ts`, mounted at `/api/shift-chat`):
 *   - Every route is `requireAuth` + `requireEffectiveRole("technician")` (pin
 *     lifts the floor to `senior_technician`). An OFF-SHIFT caller resolves
 *     BELOW the technician floor and receives 403 `INSUFFICIENT_ROLE`
 *     (envelope `code: "ACCESS_DENIED", reason: "INSUFFICIENT_ROLE"`) — mapped
 *     via `isOffWindowError` to the dedicated empty state, never an error toast.
 *   - A technician who IS on the floor but has no active roster window gets a
 *     200 with `shiftSessionId: null` and empty arrays — the SAME "no window"
 *     UX, distinguished by the null session id, not an error.
 *   - `GET /messages?after=<ISO>` scopes by roster window and returns only rows
 *     with `createdAt > after` (server `gt`); `after` omitted returns the full
 *     window. `pinnedMessage` is queried INDEPENDENTLY of `after`, so it comes
 *     back fresh on every incremental poll. An unparseable `after` 400s
 *     `VALIDATION_FAILED`/`INVALID_AFTER`.
 *
 * Transport: this is THE ONE sanctioned polling surface (G3-PLAN §1.4) — shift
 * chat is explicitly NOT on SSE (its web transport is gt-poll + a collab nudge
 * we do not have a socket.io-client for, seam §6.9). The incremental `?after=`
 * fetch is driven by react-query `refetchInterval`, gated to screen-focused +
 * app-foregrounded + an active window (see `useShiftChat` + `poll-gate.ts`).
 */
import { ApiCodedError, requestJson } from "@/lib/api/coded-error";

export { retryUnlessClientError } from "@/lib/api/coded-error";

/** Canonical shift-chat query-key factory — everything nests under `all`. */
export const shiftChatKeys = {
  all: ["shiftChat"] as const,
  messages: () => [...shiftChatKeys.all, "messages"] as const,
};

/** Fixed server reaction enum (`server/routes/shift-chat.ts` Zod). */
export const REACTION_EMOJIS = ["👍", "✅", "👀"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Ack status enum (broadcast/system messages only — regular msgs 400). */
export type AckStatus = "acknowledged" | "snoozed";

export type ShiftMessageAck = Readonly<{ userId: string; status: string }>;
export type ShiftMessageReaction = Readonly<{ userId: string; emoji: string }>;

/**
 * A shift-chat message row (server `vt_shift_messages`, normalized to the
 * viewer's window id). Dates arrive as ISO strings over JSON. Only the fields
 * the RN surface renders/keys on are modelled; extend when a consumer needs
 * more, never re-declare.
 */
export type ShiftMessage = Readonly<{
  id: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: string | null;
  body: string;
  /** "regular" | "broadcast" | "system". */
  type: string;
  broadcastKey: string | null;
  systemEventType: string | null;
  isUrgent: boolean;
  pinnedAt: string | null;
  createdAt: string;
  acks: ShiftMessageAck[];
  reactions: ShiftMessageReaction[];
}>;

/** GET /messages payload — the whole chat snapshot for the caller's window. */
export type ShiftChatSnapshot = Readonly<{
  messages: ShiftMessage[];
  pinnedMessage: ShiftMessage | null;
  /** Display NAMES of users currently typing (server presence map). */
  typing: string[];
  onlineUserIds: string[];
  /** The active roster window id, or null when the caller has no open window. */
  shiftSessionId: string | null;
}>;

/** The "no active window" snapshot — the shape the off-window 403 maps to. */
export const EMPTY_WINDOW_SNAPSHOT: ShiftChatSnapshot = {
  messages: [],
  pinnedMessage: null,
  typing: [],
  onlineUserIds: [],
  shiftSessionId: null,
};

/**
 * The roster-derived off-window signal — 403 `INSUFFICIENT_ROLE` from the
 * technician floor (an off-shift caller resolves below it). Deliberately narrow:
 * a 401, or any other 403 reason, is a different state. The server surfaces the
 * reason under `reason` (envelope `code: "ACCESS_DENIED"`), so match either.
 */
export function isOffWindowError(error: unknown): boolean {
  return (
    error instanceof ApiCodedError &&
    error.status === 403 &&
    (error.reason === "INSUFFICIENT_ROLE" || error.code === "INSUFFICIENT_ROLE")
  );
}

export const shiftChatApi = {
  /**
   * GET /api/shift-chat/messages[?after=<ISO>] — the incremental window fetch.
   * `after` omitted → full window; otherwise only rows strictly newer than the
   * cursor (server `gt`). `pinnedMessage`/`typing`/`onlineUserIds` always come
   * back fresh regardless of `after`.
   */
  getMessages: (after?: string): Promise<ShiftChatSnapshot> =>
    requestJson<ShiftChatSnapshot>(
      after ? `/api/shift-chat/messages?after=${encodeURIComponent(after)}` : "/api/shift-chat/messages",
    ),

  /** POST /api/shift-chat/messages — a regular message (201 `{message}`). */
  sendMessage: async (body: string): Promise<ShiftMessage> => {
    const payload = await requestJson<{ message: ShiftMessage }>("/api/shift-chat/messages", {
      method: "POST",
      body: JSON.stringify({ body, type: "regular" }),
    });
    return payload.message;
  },

  /**
   * POST /api/shift-chat/messages/:id/ack — broadcast/system only (the server
   * 400s a regular-message ack). Body `{status}`.
   */
  ackMessage: (messageId: string, status: AckStatus = "acknowledged"): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(
      `/api/shift-chat/messages/${encodeURIComponent(messageId)}/ack`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),

  /** POST /api/shift-chat/reactions — toggle; server returns `{action}`. */
  react: (messageId: string, emoji: ReactionEmoji): Promise<{ action: "added" | "removed" }> =>
    requestJson<{ action: "added" | "removed" }>("/api/shift-chat/reactions", {
      method: "POST",
      body: JSON.stringify({ messageId, emoji }),
    }),

  /** POST /api/shift-chat/typing — presence ping, no body (fire-and-forget). */
  sendTyping: (): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>("/api/shift-chat/typing", { method: "POST" }),

  /**
   * POST /api/shift-chat/messages/:id/pin — senior_technician+ (pre-gated in
   * the UI; the server still enforces). Returns `{ok, pinnedAt}`.
   */
  pin: (messageId: string): Promise<{ ok: boolean; pinnedAt: string }> =>
    requestJson<{ ok: boolean; pinnedAt: string }>(
      `/api/shift-chat/messages/${encodeURIComponent(messageId)}/pin`,
      { method: "POST" },
    ),
};
