/**
 * Shift-chat composition hook (G3 Slice 8) — single-sources the chat snapshot in
 * the react-query cache and drives the sanctioned focused-foreground poll.
 *
 * Freshness model (G3-PLAN §1.4, the ONE polling exception):
 *   - The queryFn accumulates: it reads the prior snapshot from the cache,
 *     derives the `?after=` cursor, fetches the incremental batch, and folds it
 *     in via the pure `mergeSnapshot`. An off-window 403 maps to the null-window
 *     snapshot (dedicated empty state), never an error surface.
 *   - `refetchInterval` is `computeRefetchInterval({isFocused, appActive,
 *     hasWindow})` — a pure gate that returns `false` (stops the poll) the
 *     instant the screen blurs, the app backgrounds, or there is no window.
 *
 * Own actions (send/ack/react) patch the cache optimistically because the
 * `?after=` model never re-delivers changes to older-than-cursor rows; the
 * server stays the source of truth and the poll reconciles others' actions.
 */
import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";

import { useIdentity } from "@/app/useIdentity";
import { useAppActive } from "@/hooks/useAppActive";
import {
  EMPTY_WINDOW_SNAPSHOT,
  isOffWindowError,
  retryUnlessClientError,
  shiftChatApi,
  shiftChatKeys,
  type ReactionEmoji,
  type ShiftChatSnapshot,
} from "@/lib/api/shift-chat";
import { hasRoleAtLeast } from "@/lib/roles";
import {
  applyOwnAck,
  applyOwnMessage,
  applyOwnReaction,
  cursorFor,
  mergeSnapshot,
} from "@/features/shift-chat/message-accumulator";
import { computeRefetchInterval, SHIFT_CHAT_POLL_MS } from "@/features/shift-chat/poll-gate";

/** Presence throttle — matches the server TYPING_TTL_MS so we ping at most once/window. */
const TYPING_THROTTLE_MS = 3000;

export type UseShiftChat = ReturnType<typeof useShiftChat>;

export function useShiftChat() {
  const queryClient = useQueryClient();
  const key = shiftChatKeys.messages();

  const identity = useIdentity();
  const meUserId = identity.data?.id ?? null;
  const meName = identity.data?.name ?? null;
  const canPin = hasRoleAtLeast(identity.data?.effectiveRole, "senior_technician");

  const isFocused = useIsFocused();
  const appActive = useAppActive();

  const query = useQuery<ShiftChatSnapshot, Error>({
    queryKey: key,
    queryFn: async () => {
      const prev = queryClient.getQueryData<ShiftChatSnapshot>(key);
      try {
        const incoming = await shiftChatApi.getMessages(cursorFor(prev));
        return mergeSnapshot(prev, incoming);
      } catch (err) {
        // Off-window (below-technician) → the dedicated empty state, and
        // hasWindow=false stops the poll from re-hitting the 403.
        if (isOffWindowError(err)) return EMPTY_WINDOW_SNAPSHOT;
        throw err;
      }
    },
    retry: retryUnlessClientError,
    // THE sanctioned poll (G3-PLAN §1.4): the pure gate returns `false` — react-
    // query stops the interval — the instant the screen blurs, the app
    // backgrounds, or the caller has no active window.
    refetchInterval: (q) =>
      computeRefetchInterval(
        { isFocused, appActive, hasWindow: q.state.data?.shiftSessionId != null },
        SHIFT_CHAT_POLL_MS,
      ),
  });

  const snapshot = query.data;
  const hasWindow = snapshot?.shiftSessionId != null;
  const isOffWindow = query.isSuccess && !hasWindow;

  const patchCache = useCallback(
    (updater: (s: ShiftChatSnapshot) => ShiftChatSnapshot) => {
      queryClient.setQueryData<ShiftChatSnapshot>(key, (prev) => (prev ? updater(prev) : prev));
    },
    [queryClient, key],
  );

  const refetch = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: key });
  }, [queryClient, key]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => shiftChatApi.sendMessage(body),
    onSuccess: (message) => patchCache((s) => applyOwnMessage(s, message)),
    onSettled: refetch,
  });

  const ackMutation = useMutation({
    mutationFn: (messageId: string) => shiftChatApi.ackMessage(messageId, "acknowledged"),
    onSuccess: (_res, messageId) => {
      if (meUserId) patchCache((s) => applyOwnAck(s, messageId, meUserId, "acknowledged"));
    },
    onSettled: refetch,
  });

  const reactMutation = useMutation({
    mutationFn: (vars: { messageId: string; emoji: ReactionEmoji }) =>
      shiftChatApi.react(vars.messageId, vars.emoji),
    onSuccess: (res, vars) => {
      if (meUserId) {
        patchCache((s) => applyOwnReaction(s, vars.messageId, meUserId, vars.emoji, res.action));
      }
    },
    onSettled: refetch,
  });

  const pinMutation = useMutation({
    mutationFn: (messageId: string) => shiftChatApi.pin(messageId),
    onSettled: refetch,
  });

  // Typing presence — fire-and-forget, throttled to the server TTL window.
  const lastTypingRef = useRef(0);
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current < TYPING_THROTTLE_MS) return;
    lastTypingRef.current = now;
    void shiftChatApi.sendTyping().catch(() => {});
  }, []);

  // Presence names to display exclude the caller (the server includes self when
  // self typed within the TTL). Latin-name isolation happens at the render site.
  const typingNames = useMemo(
    () => (snapshot?.typing ?? []).filter((name) => name !== meName),
    [snapshot?.typing, meName],
  );

  const send = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (trimmed.length > 0) sendMutation.mutate(trimmed);
    },
    [sendMutation],
  );

  const react = useCallback(
    (messageId: string, emoji: ReactionEmoji) => reactMutation.mutate({ messageId, emoji }),
    [reactMutation],
  );

  return {
    status: query.status,
    isFetching: query.isFetching,
    isOffWindow,
    messages: snapshot?.messages ?? [],
    pinnedMessage: snapshot?.pinnedMessage ?? null,
    typingNames,
    onlineCount: snapshot?.onlineUserIds.length ?? 0,
    meUserId,
    canPin,
    error: query.error,
    retry: refetch,
    send,
    sendPending: sendMutation.isPending,
    sendError: sendMutation.error,
    ack: ackMutation.mutate,
    ackPendingId: ackMutation.isPending ? ackMutation.variables ?? null : null,
    react,
    pin: pinMutation.mutate,
    notifyTyping,
  };
}
