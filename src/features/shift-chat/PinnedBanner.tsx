/**
 * The pinned-message banner — an opaque `surface-raised` strip above the list.
 * The server returns the current pinned message on every poll (independent of
 * the `?after=` cursor), so this simply reflects it. Sender name FSI/PDI-isolated.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ltrIsolate } from "@/components/equipment/detail/DetailBits";
import type { ShiftMessage } from "@/lib/api/shift-chat";

type PinnedBannerProps = Readonly<{ message: ShiftMessage }>;

export function PinnedBanner({ message }: PinnedBannerProps) {
  const { t } = useTranslation();
  const sender = message.senderName?.trim() ? ltrIsolate(message.senderName.trim()) : null;
  return (
    <View className="mx-3 mt-2 rounded-md border border-border bg-surface-raised px-3 py-2">
      <View className="mb-0.5 flex-row items-center gap-1.5">
        <Text className="font-rubik-bold text-[11px] text-accent">{t("shiftChat.pinned")}</Text>
        {sender ? <Text className="font-rubik text-[11px] text-muted">{sender}</Text> : null}
      </View>
      <Text className="font-rubik text-[13px] text-foreground" numberOfLines={2}>
        {message.body?.trim() ? message.body : t("shiftChat.systemUpdate")}
      </Text>
    </View>
  );
}
