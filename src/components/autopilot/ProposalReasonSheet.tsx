/**
 * Reason / note capture sheet for a proposal decision (G3 Slice 11) — reused for
 * BOTH Reject (required reason) and Edit (required note). Presentation mirrors
 * the landed `ShiftAdjustmentSheet` precedent exactly: an RN transparent `Modal`
 * hosting the Slice-1 `BottomSheet` primitive (nav files frozen post-Slice-1, so
 * no new transparentModal route). The sheet's T2 glass is the screen's ONE blur
 * layer, alive only while open.
 *
 * The confirm button is danger-SOLID for reject (danger surface — solid fill,
 * plain Pressable, never animated) and the violet primary CTA for edit. Text
 * entry is opaque `surface-raised`. No content/layout animation.
 */
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { PressableScale } from "@/components/PressableScale";
import { BottomSheet } from "@/components/ui/BottomSheet";

export type ProposalSheetSpec = Readonly<{
  /** Remount token — proposal id + mode; the sheet resets its text per opening. */
  token: string;
  title: string;
  placeholder: string;
  submitLabel: string;
  danger: boolean;
  maxLength: number;
}>;

type SheetContentProps = Readonly<{
  spec: ProposalSheetSpec;
  isPending: boolean;
  errorMessage: string | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}>;

function SheetContent({ spec, isPending, errorMessage, onSubmit, onClose }: SheetContentProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  const [text, setText] = useState("");
  const trimmed = text.trim();
  const submitDisabled = trimmed.length === 0 || isPending;

  return (
    <View className="gap-3.5">
      <Text className="font-rubik-bold text-[17px] text-foreground">{spec.title}</Text>

      <TextInput
        className="min-h-[96px] rounded-[16px] border border-border bg-surface-raised px-4 py-3 font-rubik text-[14px] text-foreground"
        placeholder={spec.placeholder}
        placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={spec.maxLength}
        accessibilityLabel={spec.title}
        style={{ textAlignVertical: "top" }}
      />

      {errorMessage ? (
        <Text className="text-center font-rubik-semibold text-[13px] text-danger">
          {errorMessage}
        </Text>
      ) : null}

      {spec.danger ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={spec.submitLabel}
          accessibilityState={{ disabled: submitDisabled }}
          disabled={submitDisabled}
          onPress={() => onSubmit(trimmed)}
          className={`min-h-[48px] items-center justify-center rounded-[20px] bg-danger-solid px-5 py-3 ${
            submitDisabled ? "opacity-60" : ""
          }`}
        >
          {/* AA: white on --color-danger-solid = 4.83:1 dark / 6.47:1 light (global.css). */}
          <Text className="font-rubik-semibold text-[16px] text-white">{spec.submitLabel}</Text>
        </Pressable>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={spec.submitLabel}
          accessibilityState={{ disabled: submitDisabled }}
          disabled={submitDisabled}
          className="overflow-hidden rounded-[20px]"
          onPress={() => onSubmit(trimmed)}
        >
          <View
            className={`min-h-[48px] items-center justify-center rounded-[20px] bg-gradient-to-b from-[#7C3AED] to-[#6D28D9] px-5 py-3 ${
              submitDisabled ? "opacity-60" : ""
            }`}
            style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.30)" }}
          >
            {/* AA: solid white on #7C3AED = 5.70, on #6D28D9 = 7.10. */}
            <Text className="font-rubik-semibold text-[16px] text-white">{spec.submitLabel}</Text>
          </View>
        </PressableScale>
      )}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        accessibilityState={{ disabled: isPending }}
        disabled={isPending}
        className={`min-h-[44px] items-center justify-center ${isPending ? "opacity-50" : ""}`}
        onPress={onClose}
      >
        <Text className="font-rubik-semibold text-[14px] text-muted">{t("common.cancel")}</Text>
      </PressableScale>
    </View>
  );
}

type ProposalReasonSheetProps = Readonly<{
  /** Null renders nothing (modal closed). */
  spec: ProposalSheetSpec | null;
  isPending: boolean;
  errorMessage: string | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}>;

export function ProposalReasonSheet({
  spec,
  isPending,
  errorMessage,
  onSubmit,
  onClose,
}: ProposalReasonSheetProps) {
  // While the decision is in flight the sheet stays put: Android back,
  // drag-to-dismiss and Cancel are all suppressed. Dismissing mid-flight would
  // hide the decision error (this sheet is the only place it renders) and could
  // strand a second decision racing the first. Success closes it from the screen.
  const dismiss = () => {
    if (!isPending) onClose();
  };
  return (
    <Modal
      visible={spec != null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {spec != null ? (
        <BottomSheet onDismiss={dismiss}>
          {/* key remounts fresh text state per opening (proposal + mode). */}
          <SheetContent
            key={spec.token}
            spec={spec}
            isPending={isPending}
            errorMessage={errorMessage}
            onSubmit={onSubmit}
            onClose={dismiss}
          />
        </BottomSheet>
      ) : null}
    </Modal>
  );
}
