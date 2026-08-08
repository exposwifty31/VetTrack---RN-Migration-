/**
 * Shift chat (G3 Slice 8) — messages within the caller's roster-derived window,
 * send / ack / reactions / typing, and a senior+ pin. Rewrites the Slice-1
 * placeholder (route already registered; navigation files untouched).
 *
 * Transport (G3-PLAN §1.4 — the ONE sanctioned polling exception): a focused +
 * foregrounded `?after=` poll, gated by `computeRefetchInterval` inside
 * `useShiftChat`. NOT on SSE. The gate returns `false` the instant the screen
 * blurs, the app backgrounds, or the caller has no active window.
 *
 * Aurora: message list opaque, composer `surface-raised`, zero blur layers,
 * danger (urgent) rendered as a solid chip — never glassed, never animated.
 * Off-window (403 INSUFFICIENT_ROLE, mapped) is a dedicated empty state.
 */
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import { ltrIsolate } from "@/components/equipment/detail/DetailBits";
import { Composer } from "@/features/shift-chat/Composer";
import { PinnedBanner } from "@/features/shift-chat/PinnedBanner";
import { ShiftChatMessages } from "@/features/shift-chat/ShiftChatMessages";
import { useShiftChat } from "@/features/shift-chat/useShiftChat";

function OnlineLine({ count }: Readonly<{ count: number }>) {
  const { t } = useTranslation();
  return (
    <Text className="px-3 pt-2 text-center font-rubik text-[12px] text-text-tertiary">
      {t("shiftChat.online", { count })}
    </Text>
  );
}

function TypingLine({ names }: Readonly<{ names: string[] }>) {
  const { t } = useTranslation();
  const joined = names.map((n) => ltrIsolate(n)).join(", ");
  return (
    <Text className="px-4 pb-1 font-rubik text-[12px] text-muted" numberOfLines={1}>
      {t("shiftChat.typing", { names: joined })}
    </Text>
  );
}

export function ShiftChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const chat = useShiftChat();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <AuroraBackground />
      <View className="flex-1">
        {chat.onlineCount > 0 ? <OnlineLine count={chat.onlineCount} /> : null}
        {chat.pinnedMessage ? <PinnedBanner message={chat.pinnedMessage} /> : null}

        <ShiftChatMessages
          status={chat.status}
          isOffWindow={chat.isOffWindow}
          messages={chat.messages}
          meUserId={chat.meUserId}
          canPin={chat.canPin}
          ackPendingId={chat.ackPendingId}
          onReact={chat.react}
          onAck={chat.ack}
          onPin={chat.pin}
          onRetry={chat.retry}
        />

        {chat.typingNames.length > 0 ? <TypingLine names={chat.typingNames} /> : null}

        {chat.isOffWindow ? null : (
          <View style={{ paddingBottom: insets.bottom }}>
            <Composer
              onSend={chat.send}
              onTyping={chat.notifyTyping}
              pending={chat.sendPending}
              hasError={chat.sendError != null}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
