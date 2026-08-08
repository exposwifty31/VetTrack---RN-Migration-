/**
 * Resolve-alert form — rendered INSIDE the Slice-1 `BottomSheet` (the screen's
 * one sanctioned T2 blur layer, only while open). Optional resolution note; the
 * confirm CTA is a neutral surface button (not danger — resolving is a positive
 * action, so the danger family stays untouched). Cancel/confirm both live above
 * the drag handle.
 */
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";

const NOTE_MAX = 500;

export type ResolveSheetProps = Readonly<{
  equipmentName: string;
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (note: string | undefined) => void;
  onCancel: () => void;
}>;

export function ResolveSheet({
  equipmentName,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: ResolveSheetProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const [note, setNote] = useState("");

  const submit = () => {
    if (isPending) return;
    const trimmed = note.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <View>
      <Text className="font-rubik-bold text-[18px] text-foreground">
        {t("alerts.resolveSheet.title")}
      </Text>
      <Text
        className="mt-0.5 font-rubik-semibold text-[14px] text-muted"
        numberOfLines={1}
        style={{ writingDirection: "ltr" }}
      >
        {equipmentName}
      </Text>
      <Text className="mt-2 font-rubik text-[13px] text-text-tertiary">
        {t("alerts.resolveSheet.body")}
      </Text>

      <TextInput
        className="mt-3 min-h-[56px] rounded-md border border-border bg-surface px-4 py-3 font-rubik text-[15px] text-foreground"
        placeholder={t("alerts.resolveSheet.notePlaceholder")}
        placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        multiline
        editable={!isPending}
        accessibilityLabel={t("alerts.resolveSheet.notePlaceholder")}
      />

      {errorMessage ? (
        <Text className="mt-2 font-rubik text-[13px] text-danger">{errorMessage}</Text>
      ) : null}

      <View className="mt-4 flex-row gap-3">
        <PressableScale
          accessibilityRole="button"
          className="min-h-[48px] flex-1 items-center justify-center rounded-md border border-border bg-surface px-4 py-3"
          onPress={onCancel}
        >
          <Text className="font-rubik-semibold text-[15px] text-muted">{t("common.cancel")}</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ disabled: isPending }}
          disabled={isPending}
          className="min-h-[48px] flex-1 items-center justify-center rounded-md border border-border bg-surface-raised px-4 py-3"
          onPress={submit}
        >
          <Text
            className={`font-rubik-semibold text-[15px] ${isPending ? "text-muted" : "text-foreground"}`}
          >
            {t("alerts.resolveSheet.confirm")}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
