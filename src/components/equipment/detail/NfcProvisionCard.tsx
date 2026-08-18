/**
 * Sticker provisioning — program a tag for this equipment, and permanently lock
 * it. The RN counterpart of the Capacitor pair's two admin actions
 * (`vettrack/src/pages/equipment-detail.tsx:922-985`).
 *
 * WHY THE LOCK IS TWO PRESSES, NOT ONE. An NTAG215 lock is irreversible on real
 * hardware — no undo, no admin override. A single-press control puts a scrapped
 * sticker one mis-tap away, so locking is modelled as an explicit arm → confirm
 * transition (`armed` state) rather than a button with a scary label. The web
 * pair uses a modal dialog for the same reason; a modal is the wrong shape here
 * because the operator's other hand is holding a sticker against the phone, so
 * the confirm is inline, adjacent, and disarms itself after every attempt.
 *
 * WRITE AND BIND ARE TWO INDEPENDENTLY-FAILABLE STEPS. Programming the tag is
 * physical; binding its UID to the row is a network call. A bind failure gets
 * its OWN copy because re-writing a correctly-programmed tag fixes nothing —
 * and `NFC_TAG_ALREADY_BOUND` in particular means the operator grabbed a
 * sticker that belongs to other equipment.
 *
 * Admin-gated, mirroring `showWriteNfc = isAdmin && nfcWriteSupported`
 * (equipment-detail.tsx:1063). The server floor on PATCH /:id is `technician`;
 * the stricter UI floor is the existing product policy, not a guess.
 *
 * Aurora budget: no blur, no animated danger. The confirm surface is a static
 * danger-toned block and its buttons are plain `Pressable` with `active:opacity`
 * — press-scale is never applied to a danger fill (the DetailBits rule).
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useIdentity } from "@/app/useIdentity";
import { SectionCard } from "@/components/ui/SectionCard";
import { useNfcSupported } from "@/hooks/useNfcSupported";
import { api, equipmentKeys } from "@/lib/api";
import { ApiCodedError } from "@/lib/api/coded-error";
import { haptics } from "@/lib/haptics";
import {
  cancelNfcProvisioning,
  lockEquipmentStickerTag,
  NfcProvisionError,
  type NfcProvisionErrorCode,
  writeEquipmentStickerTag,
} from "@/lib/nfc-provision";
import { hasRoleAtLeast } from "@/lib/roles";
import type { EquipmentDetail } from "@/types/api";

import { PrimaryButton, QuietButton, SectionTitle } from "./DetailBits";

/**
 * Every string this card can render as feedback, as a LITERAL union rather than
 * `string`. Two reasons, both load-bearing:
 *   - the typed `t` from i18next only accepts known keys, so a dynamic `string`
 *     does not type-check at all (that is the guard working, not an obstacle);
 *   - `equipmentDetail.nfc.errors.${NfcProvisionErrorCode}` expands to one key
 *     per code, so ADDING a code to the union in `nfc-provision.ts` fails the
 *     build until the matching key exists in both locales. The error copy cannot
 *     silently fall behind the error taxonomy.
 */
type NfcCopyKey =
  | "equipmentDetail.nfc.writeSuccess"
  | "equipmentDetail.nfc.lockSuccess"
  | "equipmentDetail.nfc.lockAlreadyLocked"
  | "equipmentDetail.nfc.errors.bindConflict"
  | "equipmentDetail.nfc.errors.bindFailed"
  | `equipmentDetail.nfc.errors.${NfcProvisionErrorCode}`;

type Feedback = { tone: "success" | "error"; key: NfcCopyKey };

/**
 * A `NfcProvisionError` code IS the copy key suffix — the union in
 * `nfc-provision.ts` and the `errors.*` block in the locales are kept in step by
 * the i18n parity suite plus the card's own per-code cases. Anything else (a
 * thrown TypeError, an aborted host) falls back to the caller's generic key
 * rather than rendering a raw message at an operator.
 */
function provisionErrorKey(error: unknown, fallback: NfcCopyKey): NfcCopyKey {
  if (error instanceof NfcProvisionError) return `equipmentDetail.nfc.errors.${error.code}`;
  return fallback;
}

/** The bind half has its own two outcomes — conflict is not "the write failed". */
function bindErrorKey(error: unknown): NfcCopyKey {
  if (error instanceof ApiCodedError && error.reason === "NFC_TAG_ALREADY_BOUND") {
    return "equipmentDetail.nfc.errors.bindConflict";
  }
  return "equipmentDetail.nfc.errors.bindFailed";
}

function DangerButton({
  label,
  onPress,
  disabled,
  testID,
}: Readonly<{ label: string; onPress: () => void; disabled?: boolean; testID: string }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      className={`min-h-[48px] items-center justify-center rounded-[20px] bg-danger-solid px-5 py-3 active:opacity-80 ${
        disabled ? "opacity-40" : ""
      }`}
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[15px] text-white">{label}</Text>
    </Pressable>
  );
}

export function NfcProvisionCard({ detail }: Readonly<{ detail: EquipmentDetail }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const identity = useIdentity();
  const supported = useNfcSupported();

  const [armed, setArmed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const write = useMutation({
    mutationFn: async () => {
      const { tagId } = await writeEquipmentStickerTag(
        detail.id,
        t("equipmentDetail.nfc.holdSticker"),
      );
      // `null` = the tag exposes no UID. The sticker IS programmed, so this is a
      // success with nothing to bind — never an error.
      if (tagId === null) return { bound: false } as const;
      try {
        await api.equipment.bindNfcTag(detail.id, tagId);
      } catch (cause) {
        throw new BindFailure(cause);
      }
      return { bound: true } as const;
    },
    onSuccess: () => {
      haptics.scanSuccess();
      setFeedback({ tone: "success", key: "equipmentDetail.nfc.writeSuccess" });
    },
    onError: (error: unknown) => {
      haptics.error();
      setFeedback({
        tone: "error",
        key:
          error instanceof BindFailure
            ? bindErrorKey(error.cause)
            : provisionErrorKey(error, "equipmentDetail.nfc.errors.write_failed"),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });

  const lock = useMutation({
    mutationFn: () => lockEquipmentStickerTag(t("equipmentDetail.nfc.holdSticker")),
    onSuccess: ({ alreadyLocked }) => {
      haptics.scanSuccess();
      setFeedback({
        tone: "success",
        key: alreadyLocked
          ? "equipmentDetail.nfc.lockAlreadyLocked"
          : "equipmentDetail.nfc.lockSuccess",
      });
    },
    onError: (error: unknown) => {
      haptics.error();
      setFeedback({
        tone: "error",
        key: provisionErrorKey(error, "equipmentDetail.nfc.errors.lock_failed"),
      });
    },
    // Disarm on EVERY outcome — a confirm left hot after an attempt is the
    // mis-tap this whole shape exists to prevent.
    onSettled: () => setArmed(false),
  });

  // The tablet swaps this card out from under a live session: the two-pane
  // detail is keyed on the selected equipment id (EquipmentListScreen), so
  // tapping another unit REMOUNTS the card. Leaving the session open would let
  // the next unit's blank sticker be locked by the previous unit's confirm —
  // irreversible, and against a screen the operator can no longer see.
  useEffect(() => () => void cancelNfcProvisioning(), []);

  const arm = useCallback(() => {
    haptics.tap();
    setFeedback(null);
    setArmed(true);
  }, []);

  const busy = write.isPending || lock.isPending;

  // Admin-only, and only once the hardware probe has actually answered. `null`
  // (undetermined) renders nothing rather than flashing a wrong state.
  if (!hasRoleAtLeast(identity.data?.role, "admin") || supported !== true) return null;

  return (
    <SectionCard>
      <View testID="nfc-provision-card" className="gap-2.5">
        <SectionTitle title={t("equipmentDetail.nfc.title")} />

        <Text
          testID="nfc-bound-state"
          className="font-rubik text-[13px] text-muted"
          // A tag UID is guaranteed-Latin hex — pin it LTR inside RTL copy, the
          // KeyValueRow `ltr` idiom.
          style={detail.nfcTagId ? { writingDirection: "ltr" } : undefined}
          selectable={!!detail.nfcTagId}
        >
          {detail.nfcTagId
            ? t("equipmentDetail.nfc.bound", { tagId: detail.nfcTagId })
            : t("equipmentDetail.nfc.notBound")}
        </Text>

        <PrimaryButton
          label={t("equipmentDetail.nfc.write")}
          disabled={busy}
          onPress={() => {
            setFeedback(null);
            write.mutate();
          }}
          testID="nfc-write-button"
        />

        {armed ? (
          <View className="gap-2.5 rounded-[20px] border border-danger bg-surface px-4 py-3">
            <Text
              testID="nfc-lock-warning"
              className="font-rubik-bold text-[14px] text-danger light:text-[#B91C1C]"
            >
              {t("equipmentDetail.nfc.lockConfirmTitle")}
            </Text>
            <Text className="font-rubik text-[13px] text-foreground">
              {t("equipmentDetail.nfc.lockConfirmBody")}
            </Text>
            <DangerButton
              testID="nfc-lock-confirm"
              label={t("equipmentDetail.nfc.lockConfirmAction")}
              disabled={busy}
              onPress={() => {
                setFeedback(null);
                lock.mutate();
              }}
            />
            <QuietButton
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setArmed(false)}
              testID="nfc-lock-cancel"
            />
          </View>
        ) : (
          <QuietButton
            label={t("equipmentDetail.nfc.lock")}
            disabled={busy}
            onPress={arm}
            testID="nfc-lock-arm"
          />
        )}

        {feedback ? (
          <Text
            testID={
              feedback.tone === "success" ? "nfc-provision-success" : "nfc-provision-error"
            }
            className={
              feedback.tone === "success"
                ? "font-rubik-semibold text-[13px] text-success light:text-[#166534]"
                : "font-rubik-semibold text-[13px] text-danger light:text-[#B91C1C]"
            }
          >
            {t(feedback.key)}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

/**
 * Marks "the tag was written, the BIND failed" so `onError` can pick bind copy
 * instead of write copy. A discriminated wrapper rather than a flag on the
 * mutation, because the mutation's error channel is the only thing that reaches
 * `onError`.
 */
class BindFailure extends Error {
  constructor(readonly cause: unknown) {
    super("bind_failed");
    this.name = "BindFailure";
  }
}
