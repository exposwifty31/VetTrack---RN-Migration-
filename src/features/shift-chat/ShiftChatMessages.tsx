/**
 * The message list's state ladder — off-window / loading / error / empty / list.
 *
 * Off-window (roster-derived, mapped from 403 INSUFFICIENT_ROLE) is a DEDICATED
 * empty state, never an error surface (G3-PLAN §1.6). Loading is honest static
 * skeletons (no shimmer). The list is opaque; the only motion is PressableScale
 * press feedback inside each bubble. New messages nudge the list to the end.
 */
import { useCallback, useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { FlashList, type FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
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
    // Dedicated empty state (never an error toast). The quiet retry mirrors the
    // Slice-3 off-shift pattern and is the recovery path when a shift starts
    // while the screen is open (the poll is gated off with no window).
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("shiftChat.offWindow")} body={t("shiftChat.offWindowBody")} />
        <PressableScale
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5"
          onPress={onRetry}
        >
          <Text className="font-rubik-semibold text-[14px] text-muted">{t("common.retry")}</Text>
        </PressableScale>
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
