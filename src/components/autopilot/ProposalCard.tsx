/**
 * One Autopilot proposal card (G3 Slice 11). Opaque `SectionCard` (surface —
 * cards never sit on glass). Approve = primary violet CTA (`PrimaryButton`),
 * Reject = danger-outline (plain Pressable — danger surfaces never animated),
 * Edit = quiet surface button, shown only when the kind is note-editable.
 */
import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import { PrimaryButton, QuietButton } from "@/components/equipment/detail/DetailBits";
import { formatDateTime } from "@/lib/datetime";
import type { ActionProposal } from "@/types/action-proposals";

import { proposalKindLabelKey } from "./proposal-derive";

type ProposalCardProps = Readonly<{
  proposal: ActionProposal;
  editable: boolean;
  /** A decision is in flight for THIS proposal — every action disables. */
  busy: boolean;
  onApprove: (proposal: ActionProposal) => void;
  onReject: (proposal: ActionProposal) => void;
  onEdit: (proposal: ActionProposal) => void;
}>;

/** Danger-outline button — plain Pressable, no scale animation (Aurora danger doctrine). */
function DangerOutlineButton({
  label,
  onPress,
  disabled,
}: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[48px] flex-1 items-center justify-center rounded-[20px] border border-danger bg-surface px-5 py-3"
    >
      <Text className="font-rubik-semibold text-[15px] text-danger">{label}</Text>
    </Pressable>
  );
}

function ProposalCardImpl({
  proposal,
  editable,
  busy,
  onApprove,
  onReject,
  onEdit,
}: ProposalCardProps) {
  const { t, i18n } = useTranslation();
  const createdAt = formatDateTime(proposal.createdAt, i18n.language);
  const factCount = proposal.citedFacts.length;

  const handleApprove = useCallback(() => onApprove(proposal), [onApprove, proposal]);
  const handleReject = useCallback(() => onReject(proposal), [onReject, proposal]);
  const handleEdit = useCallback(() => onEdit(proposal), [onEdit, proposal]);

  return (
    <View className="mb-2.5 rounded-md border border-border bg-surface-raised p-4">
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <Chip label={t(proposalKindLabelKey(proposal.kind))} tone="info" />
        {createdAt ? (
          <Text className="font-rubik text-[12px] text-text-tertiary" numberOfLines={1}>
            {createdAt}
          </Text>
        ) : null}
      </View>

      <Text className="font-rubik text-[15px] leading-[21px] text-foreground">
        {proposal.summary}
      </Text>

      <Text className="mt-2 font-rubik text-[12px] text-muted">{t("autopilot.proposedBy")}</Text>

      {factCount > 0 ? (
        <Text className="mt-0.5 font-rubik text-[12px] text-text-tertiary">
          {t("autopilot.rationale")}
          {" · "}
          <Text style={{ writingDirection: "ltr" }}>{String(factCount)}</Text>
        </Text>
      ) : null}

      <View className="mt-4 gap-2.5">
        <PrimaryButton label={t("autopilot.actions.approve")} onPress={handleApprove} disabled={busy} />
        <View className="flex-row gap-2.5">
          <DangerOutlineButton
            label={t("autopilot.actions.reject")}
            onPress={handleReject}
            disabled={busy}
          />
          {editable ? (
            <View className="flex-1">
              <QuietButton label={t("autopilot.actions.edit")} onPress={handleEdit} disabled={busy} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export const ProposalCard = memo(ProposalCardImpl);
