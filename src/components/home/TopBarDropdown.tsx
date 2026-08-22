/**
 * Anchored popover for the glass top bar — the shell behind the bell and
 * settings dropdowns.
 *
 * The bell and the gear used to `navigate()` straight to their full pages. The
 * ask, repeated four times, was a dropdown: a short peek plus a footer link to
 * the full page. Navigating loses the user's place on Home for information they
 * only wanted to glance at.
 *
 * Built on `Modal` rather than an absolutely-positioned sibling: the top bar
 * sits inside the scroll tree, so a plain overlay would clip against the bar's
 * `overflow-hidden` rounded container and scroll away with the content. Modal
 * also gives the backdrop press and hardware back-button dismissal for free.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";

import { TOP_BAR_HEIGHT } from "./GlassTopBar";

type TopBarDropdownProps = Readonly<{
  visible: boolean;
  onClose: () => void;
  /** Distance from the top of the screen to the bar — the popover hangs below it. */
  topInset: number;
  children: ReactNode;
  /** Footer label, e.g. "tap for all alerts". Omit for a footerless panel. */
  footerLabel?: string;
  /** Runs after the panel closes, so the caller can navigate without a race. */
  onFooterPress?: () => void;
}>;

export function TopBarDropdown({
  visible,
  onClose,
  topInset,
  children,
  footerLabel,
  onFooterPress,
}: TopBarDropdownProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // iPad: without this the Modal takes the form-sheet presentation and
      // renders as a centred card instead of a dropdown under the bar.
      presentationStyle="overFullScreen"
    >
      <Pressable
        className="flex-1"
        accessibilityRole="button"
        accessibilityLabel={t("aurora.dropdownCloseA11y")}
        onPress={onClose}
        style={{ backgroundColor: "rgba(13,11,28,0.35)" }}
      >
        {/* Stop the backdrop's press from firing when the panel itself is
            tapped. A View would swallow nothing; a Pressable with a no-op
            onPress is the RN idiom for an inert press barrier. */}
        <Pressable
          onPress={() => {}}
          style={{ position: "absolute", top: topInset + TOP_BAR_HEIGHT + 8, left: 12, right: 12 }}
          className="overflow-hidden rounded-2xl border border-border bg-surface-raised"
        >
          <ScrollView bounces={false} className="max-h-[420px]">
            {children}
          </ScrollView>
          {footerLabel ? (
            <PressableScale
              className="border-t border-border py-3.5"
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onFooterPress?.();
              }}
            >
              <Text className="text-center text-[15px] font-semibold text-primary">
                {footerLabel}
              </Text>
            </PressableScale>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
