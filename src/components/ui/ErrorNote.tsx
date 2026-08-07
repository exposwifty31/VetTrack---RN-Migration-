/**
 * Error text + optional retry — the equipment-list error idiom promoted to a
 * primitive. Danger-colored text (never glassed), quiet surface retry button
 * with the Aurora press feel.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";

type ErrorNoteProps = Readonly<{
  message: string;
  onRetry?: () => void;
}>;

export function ErrorNote({ message, onRetry }: ErrorNoteProps) {
  const { t } = useTranslation();
  return (
    <View className="items-center justify-center gap-3 px-6 py-8">
      <Text className="text-center font-rubik text-[15px] text-danger">{message}</Text>
      {onRetry ? (
        <PressableScale
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5"
          onPress={onRetry}
        >
          <Text className="font-rubik-semibold text-[15px] text-foreground">
            {t("common.retry")}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
