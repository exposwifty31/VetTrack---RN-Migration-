/**
 * Start/Complete affordance — extracted so TaskRow stays layout-only. Press
 * feedback is the sanctioned PressableScale transform; pending renders as a
 * disabled, dimmed state (no spinner-in-button content animation).
 */
import { memo } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import { haptics } from "@/lib/haptics";

import type { TaskLifecycleAction } from "./tasks-derive";

export const TaskLifecycleButton = memo(function TaskLifecycleButton({
  action,
  isPending,
  onPress,
}: Readonly<{
  action: TaskLifecycleAction;
  isPending: boolean;
  onPress: (action: TaskLifecycleAction) => void;
}>) {
  const { t } = useTranslation();
  const label = action === "start" ? t("tasks.start") : t("tasks.complete");

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isPending }}
      disabled={isPending}
      className={`mt-3 min-h-[44px] items-center justify-center self-start rounded-xl bg-primary px-6 py-2.5 ${
        isPending ? "opacity-60" : ""
      }`}
      onPress={() => {
        haptics.tap();
        onPress(action);
      }}
    >
      <Text className="font-rubik-semibold text-[15px] text-primary-foreground">{label}</Text>
    </PressableScale>
  );
});
