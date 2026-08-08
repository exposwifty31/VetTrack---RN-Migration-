/**
 * The message list's state ladder — off-window / loading / error / empty / list.
 *
 * Off-window (roster-derived, mapped from 403 INSUFFICIENT_ROLE) is a DEDICATED
 * empty state, never an error surface (G3-PLAN §1.6). Loading is honest static
 * skeletons (no shimmer). The list is opaque; the only motion is PressableScale
 * press feedback inside each bubble. New messages nudge the list to the end.
 */
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { FlashList, type FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";

import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import type { ReactionEmoji, ShiftMessage } from "@/lib/api/shift-chat";

import { MessageBubble } from "./MessageBubble";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

type ShiftChatMessagesProps = Readonly<{
  status: "pending" | "error" | "success";
  isOffWindow: boolean;
  messages: ShiftMessage[];
  meUserId: string | null;
  canPin: boolean;
  ackPendingId: string | null;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onAck: (messageId: string) => void;
  onPin: (messageId: string) => void;
  onRetry: () => void;
}>;

export function ShiftChatMessages({
  status,
  isOffWindow,
  messages,
  meUserId,
  canPin,
  ackPendingId,
  onReact,
  onAck,
  onPin,
  onRetry,
}: ShiftChatMessagesProps) {
  const { t } = useTranslation();
  const listRef = useRef<FlashListRef<ShiftMessage>>(null);
  const count = messages.length;

  // Nudge to the newest message as the transcript grows (not setState — lint ok).
  useEffect(() => {
    if (count > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [count]);

  const renderItem = useCallback<ListRenderItem<ShiftMessage>>(
    ({ item }) => (
      <MessageBubble
        message={item}
        meUserId={meUserId}
        canPin={canPin}
        ackPendingId={ackPendingId}
        onReact={onReact}
        onAck={onAck}
        onPin={onPin}
      />
    ),
    [meUserId, canPin, ackPendingId, onReact, onAck, onPin],
  );

  if (isOffWindow) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("shiftChat.offWindow")} body={t("shiftChat.offWindowBody")} />
      </View>
    );
  }

  if (status === "pending") {
    return (
      <View className="flex-1 px-3 pt-2">
        {SKELETON_ROWS.map((i) => (
          <RowSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (status === "error") {
    return (
      <View className="flex-1 items-center justify-center">
        <ErrorNote message={t("shiftChat.loadError")} onRetry={onRetry} />
      </View>
    );
  }

  if (count === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("shiftChat.empty")} body={t("shiftChat.emptyBody")} />
      </View>
    );
  }

  return (
    <FlashList
      ref={listRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
    />
  );
}
