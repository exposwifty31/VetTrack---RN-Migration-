/**
 * Message composer — a `surface-raised` bar (the screen has zero blur layers).
 * Typing fires a throttled presence ping; send trims + clears. The Send control
 * is disabled while empty or in flight; a send failure surfaces inline copy,
 * never a toast. TextInput carries user content (Hebrew/mixed) so its base
 * direction is left to RN; only the numeric/id chrome elsewhere forces LTR.
 */
import { useCallback, useState } from "react";
import { TextInput, View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";

const MAX_MESSAGE_LENGTH = 1000; // server Zod max

type ComposerProps = Readonly<{
  onSend: (body: string) => void;
  onTyping: () => void;
  pending: boolean;
  hasError: boolean;
}>;

export function Composer({ onSend, onTyping, pending, hasError }: ComposerProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !pending;

  const onChange = useCallback(
    (value: string) => {
      setText(value);
      if (value.trim().length > 0) onTyping();
    },
    [onTyping],
  );

  const submit = useCallback(() => {
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  }, [trimmed, onSend]);

  return (
    <View className="border-t border-border bg-surface-raised px-3 pb-1 pt-2">
      {hasError ? (
        <Text className="mb-1.5 px-1 font-rubik text-[12px] text-danger">
          {t("shiftChat.sendError")}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <TextInput
          className="min-h-[44px] max-h-[120px] flex-1 rounded-2xl border border-border bg-surface px-3.5 py-2.5 font-rubik text-[15px] text-foreground"
          placeholder={t("shiftChat.placeholder")}
          placeholderTextColor={theme === "light" ? "#5B5680" : "#A6A0C3"}
          value={text}
          onChangeText={onChange}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          accessibilityLabel={t("shiftChat.placeholder")}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("shiftChat.send")}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          className={`min-h-[44px] justify-center rounded-2xl px-4 ${canSend ? "bg-primary" : "bg-surface"}`}
          onPress={submit}
        >
          <Text
            className={`font-rubik-semibold text-[15px] ${canSend ? "text-primary-foreground" : "text-muted"}`}
          >
            {t("shiftChat.send")}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
