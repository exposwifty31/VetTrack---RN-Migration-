/**
 * One shift-chat row. Three shapes, all OPAQUE (message list carries zero glass):
 *   - system    → centered muted pill;
 *   - broadcast → full-width surface-raised announcement card with an ack;
 *   - regular   → own (accent-filled, end-aligned) vs other (surface, start).
 *
 * Own-vs-other contrast is token-driven (`bg-primary`/`primary-foreground` vs
 * `bg-surface`/`foreground`). Sender names are FSI/PDI-isolated (Latin names in
 * an RTL column); timestamps go through `datetime.ts`; urgent uses a solid
 * danger chip (never glassed, never animated). Press feedback via PressableScale.
 */
import { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { ltrIsolate } from "@/components/equipment/detail/DetailBits";
import { formatTime } from "@/lib/datetime";
import type { ReactionEmoji, ShiftMessage } from "@/lib/api/shift-chat";

import { ReactionBar } from "./ReactionBar";

type MessageBubbleProps = Readonly<{
  message: ShiftMessage;
  meUserId: string | null;
  canPin: boolean;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onAck: (messageId: string) => void;
  onPin: (messageId: string) => void;
  ackPendingId: string | null;
}>;

function SenderLine({ name, role }: Readonly<{ name: string | null; role: string | null }>) {
  const label = name?.trim() ? ltrIsolate(name.trim()) : role ?? "";
  if (!label) return null;
  return <Text className="mb-0.5 font-rubik-semibold text-[12px] text-muted">{label}</Text>;
}

function TimeStamp({ iso, muted = true }: Readonly<{ iso: string; muted?: boolean }>) {
  const time = formatTime(iso);
  if (!time) return null;
  return (
    <Text
      className={`mt-1 font-rubik text-[11px] ${muted ? "text-text-tertiary" : "text-primary-foreground"}`}
      style={{ writingDirection: "ltr" }}
    >
      {time}
    </Text>
  );
}

function PinAction({ label, hint, onPress }: Readonly<{ label: string; hint: string; onPress: () => void }>) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="min-h-[28px] justify-center rounded-full border border-border bg-surface px-2.5"
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[11px] text-muted">{label}</Text>
    </PressableScale>
  );
}

/** system → centered muted pill (falls back to a generic "shift update" label). */
function SystemMessage({ body }: Readonly<{ body: string | null }>) {
  const { t } = useTranslation();
  return (
    <View className="my-1.5 items-center">
      <View className="max-w-[85%] rounded-full border border-border bg-surface px-3 py-1.5">
        <Text className="text-center font-rubik text-[12px] text-muted">
          {body?.trim() ? body : t("shiftChat.systemUpdate")}
        </Text>
      </View>
    </View>
  );
}

type BroadcastMessageProps = Readonly<{
  message: ShiftMessage;
  meUserId: string | null;
  acked: boolean;
  canShowPin: boolean;
  ackPendingId: string | null;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onAck: (messageId: string) => void;
  onPin: (messageId: string) => void;
}>;

/** broadcast → full-width surface-raised announcement card with an ack. */
function BroadcastMessage({
  message,
  meUserId,
  acked,
  canShowPin,
  ackPendingId,
  onReact,
  onAck,
  onPin,
}: BroadcastMessageProps) {
  const { t } = useTranslation();
  return (
    <View className="my-1.5 rounded-md border border-border bg-surface-raised p-3">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="font-rubik-bold text-[12px] text-info">{t("shiftChat.broadcast")}</Text>
        {canShowPin ? (
          <PinAction
            label={t("shiftChat.pin")}
            hint={t("shiftChat.seniorOnly")}
            onPress={() => onPin(message.id)}
          />
        ) : null}
      </View>
      <SenderLine name={message.senderName} role={message.senderRole} />
      <Text className="font-rubik text-[14px] text-foreground">{message.body}</Text>
      <View className="mt-2 flex-row items-center justify-between">
        <TimeStamp iso={message.createdAt} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={acked ? t("shiftChat.acked") : t("shiftChat.ack")}
          accessibilityState={{ disabled: acked || ackPendingId === message.id }}
          disabled={acked || ackPendingId === message.id}
          className={`min-h-[36px] justify-center rounded-full px-4 ${
            acked ? "bg-surface" : "bg-primary"
          }`}
          onPress={() => onAck(message.id)}
        >
          <Text
            className={`font-rubik-semibold text-[13px] ${
              acked ? "text-muted" : "text-primary-foreground"
            }`}
          >
            {acked ? t("shiftChat.acked") : t("shiftChat.ack")}
          </Text>
        </PressableScale>
      </View>
      <ReactionBar
        reactions={message.reactions}
        meUserId={meUserId}
        onToggle={(emoji) => onReact(message.id, emoji)}
      />
    </View>
  );
}

type RegularMessageProps = Readonly<{
  message: ShiftMessage;
  meUserId: string | null;
  isOwn: boolean;
  canShowPin: boolean;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onPin: (messageId: string) => void;
}>;

/** regular → own (accent-filled, end-aligned) vs other (surface, start). */
function RegularMessage({
  message,
  meUserId,
  isOwn,
  canShowPin,
  onReact,
  onPin,
}: RegularMessageProps) {
  const { t } = useTranslation();
  return (
    <View className={`my-1 max-w-[85%] ${isOwn ? "self-end" : "self-start"}`}>
      <View
        className={`rounded-2xl px-3.5 py-2.5 ${isOwn ? "bg-primary" : "border border-border bg-surface"}`}
      >
        {!isOwn ? <SenderLine name={message.senderName} role={message.senderRole} /> : null}
        {message.isUrgent ? (
          <View className="mb-1 self-start rounded-full bg-danger-solid px-2 py-0.5">
            <Text className="font-rubik-semibold text-[11px] text-white">{t("shiftChat.urgent")}</Text>
          </View>
        ) : null}
        <Text
          className={`font-rubik text-[15px] ${isOwn ? "text-primary-foreground" : "text-foreground"}`}
        >
          {message.body}
        </Text>
        <View className="flex-row items-center justify-between gap-3">
          <TimeStamp iso={message.createdAt} muted={!isOwn} />
          {canShowPin ? (
            <PinAction
              label={t("shiftChat.pin")}
              hint={t("shiftChat.seniorOnly")}
              onPress={() => onPin(message.id)}
            />
          ) : null}
        </View>
      </View>
      <ReactionBar
        reactions={message.reactions}
        meUserId={meUserId}
        onToggle={(emoji) => onReact(message.id, emoji)}
      />
    </View>
  );
}

/**
 * Thin dispatcher over the three row shapes — the render bodies live in focused
 * sub-components so no single function carries the whole tree's branching. The
 * action/permission contracts (ack, react, pin, pending, own-vs-other) are
 * unchanged; only the structure moved.
 */
function MessageBubbleImpl({
  message,
  meUserId,
  canPin,
  onReact,
  onAck,
  onPin,
  ackPendingId,
}: MessageBubbleProps) {
  if (message.type === "system") {
    return <SystemMessage body={message.body} />;
  }

  const acked = meUserId != null && message.acks.some((a) => a.userId === meUserId);
  const canShowPin = canPin && message.pinnedAt == null;

  if (message.type === "broadcast") {
    return (
      <BroadcastMessage
        message={message}
        meUserId={meUserId}
        acked={acked}
        canShowPin={canShowPin}
        ackPendingId={ackPendingId}
        onReact={onReact}
        onAck={onAck}
        onPin={onPin}
      />
    );
  }

  const isOwn = message.senderId != null && message.senderId === meUserId;
  return (
    <RegularMessage
      message={message}
      meUserId={meUserId}
      isOwn={isOwn}
      canShowPin={canShowPin}
      onReact={onReact}
      onPin={onPin}
    />
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
