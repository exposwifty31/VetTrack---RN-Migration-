/**
 * Autopilot approval queue (G3 Slice 11) — the mobile-first human-approval
 * surface for Shift Autopilot `action_proposal`s. Staged proposals only
 * (`?status=staged`); each card offers Approve (primary), Reject (danger-outline,
 * required reason) and — for note-editable kinds only — Edit (a note that
 * becomes a schema-valid `editedContent`).
 *
 * Doctrine wiring:
 *   - Freshness is SSE-only: `useRealtimeInvalidation` on the four
 *     `action_proposal_*` audit actionTypes (proposals emit no domain events;
 *     the /collab-ws nudge has no RN client — seam §6.9). No polling.
 *   - Decision routes are `requireAuth` only — NO role floor, so there is NO
 *     off-shift empty state here (the wave's role-gate rule does not apply).
 *   - Mutations are plain invalidate-on-success (not optimistic): a decision is
 *     a one-way guarded transition; SSE refreshes the queue anyway.
 *   - Opaque cards; the Reject/Edit sheet is the screen's single (T2) blur layer.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import { ProposalCard } from "@/components/autopilot/ProposalCard";
import {
  ProposalReasonSheet,
  type ProposalSheetSpec,
} from "@/components/autopilot/ProposalReasonSheet";
import { buildEditedContent, isNoteEditable, NOTE_MAX_LENGTH } from "@/components/autopilot/proposal-derive";
import { useProposalDecisions } from "@/components/autopilot/useProposalDecisions";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import {
  ApiCodedError,
  actionProposalsApi,
  PROPOSAL_AUDIT_ACTION_TYPES,
  proposalKeys,
  retryUnlessClientError,
} from "@/lib/api/action-proposals";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import type { ActionProposal } from "@/types/action-proposals";

const SKELETON_ROWS = [0, 1, 2, 3];
/** Reject reason has no server max (min 1); cap the UI at a sane length. */
const REASON_MAX_LENGTH = 500;

type DecisionErrorKey = "autopilot.alreadyDecided" | "autopilot.decisionError";

/** 409 = the proposal was already decided elsewhere; everything else is generic. */
function mapDecisionErrorKey(error: unknown): DecisionErrorKey {
  if (error instanceof ApiCodedError && error.status === 409) return "autopilot.alreadyDecided";
  return "autopilot.decisionError";
}

type SheetState = Readonly<{ mode: "reject" | "edit"; proposal: ActionProposal }>;

export function AutopilotQueueScreen() {
  const { t } = useTranslation();

  useRealtimeInvalidation({
    auditActionTypes: PROPOSAL_AUDIT_ACTION_TYPES,
    queryKeys: [proposalKeys.all],
  });

  const query = useQuery<ActionProposal[], Error>({
    queryKey: proposalKeys.staged(),
    queryFn: actionProposalsApi.listStaged,
    retry: retryUnlessClientError,
  });

  const { approve, edit, reject } = useProposalDecisions();

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetErrorKey, setSheetErrorKey] = useState<DecisionErrorKey | null>(null);
  const [topErrorKey, setTopErrorKey] = useState<DecisionErrorKey | null>(null);

  const busyId = approve.isPending
    ? approve.variables
    : reject.isPending
      ? reject.variables?.id
      : edit.isPending
        ? edit.variables?.id
        : null;

  const onApprove = useCallback(
    (proposal: ActionProposal) => {
      setTopErrorKey(null);
      approve.mutate(proposal.id, {
        onError: (error) => setTopErrorKey(mapDecisionErrorKey(error)),
      });
    },
    [approve],
  );

  const onOpenReject = useCallback((proposal: ActionProposal) => {
    setSheetErrorKey(null);
    setSheet({ mode: "reject", proposal });
  }, []);

  const onOpenEdit = useCallback((proposal: ActionProposal) => {
    setSheetErrorKey(null);
    setSheet({ mode: "edit", proposal });
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  const onSheetSubmit = useCallback(
    (text: string) => {
      if (!sheet) return;
      setSheetErrorKey(null);
      if (sheet.mode === "reject") {
        reject.mutate(
          { id: sheet.proposal.id, rejectionReason: text },
          {
            onSuccess: () => setSheet(null),
            onError: (error) => setSheetErrorKey(mapDecisionErrorKey(error)),
          },
        );
        return;
      }
      const editedContent = buildEditedContent(sheet.proposal.kind, sheet.proposal.draftContent, text);
      if (!editedContent) {
        setSheetErrorKey("autopilot.decisionError");
        return;
      }
      edit.mutate(
        { id: sheet.proposal.id, editedContent },
        {
          onSuccess: () => setSheet(null),
          onError: (error) => setSheetErrorKey(mapDecisionErrorKey(error)),
        },
      );
    },
    [sheet, reject, edit],
  );

  const renderItem = useCallback<ListRenderItem<ActionProposal>>(
    ({ item }) => (
      <ProposalCard
        proposal={item}
        editable={isNoteEditable(item.kind, item.draftContent)}
        busy={item.id === busyId}
        onApprove={onApprove}
        onReject={onOpenReject}
        onEdit={onOpenEdit}
      />
    ),
    [busyId, onApprove, onOpenReject, onOpenEdit],
  );

  const sheetSpec = useMemo<ProposalSheetSpec | null>(() => {
    if (!sheet) return null;
    if (sheet.mode === "reject") {
      return {
        token: `${sheet.proposal.id}:reject`,
        title: t("autopilot.rejectSheet.title"),
        placeholder: t("autopilot.rejectSheet.placeholder"),
        submitLabel: t("autopilot.rejectSheet.submit"),
        danger: true,
        maxLength: REASON_MAX_LENGTH,
      };
    }
    return {
      token: `${sheet.proposal.id}:edit`,
      title: t("autopilot.editSheet.title"),
      placeholder: t("autopilot.editSheet.placeholder"),
      submitLabel: t("autopilot.editSheet.submit"),
      danger: false,
      maxLength: NOTE_MAX_LENGTH,
    };
  }, [sheet, t]);

  const sheetPending = sheet?.mode === "reject" ? reject.isPending : edit.isPending;
  const proposals = query.data ?? [];
  const { refetch } = query;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <View className="flex-1 px-[22px] pt-3">
        {topErrorKey ? (
          <Text className="mb-2.5 text-center font-rubik-semibold text-[13px] text-danger">
            {t(topErrorKey)}
          </Text>
        ) : null}

        <ProposalListContent
          isPending={query.isPending}
          isError={query.isError}
          proposals={proposals}
          onRetry={onRetry}
          renderItem={renderItem}
        />
      </View>

      <ProposalReasonSheet
        spec={sheetSpec}
        isPending={sheetPending}
        errorMessage={sheetErrorKey ? t(sheetErrorKey) : null}
        onSubmit={onSheetSubmit}
        onClose={closeSheet}
      />
    </View>
  );
}

/** State ladder — loading / error / empty / list (no off-shift branch: no role floor). */
function ProposalListContent({
  isPending,
  isError,
  proposals,
  onRetry,
  renderItem,
}: Readonly<{
  isPending: boolean;
  isError: boolean;
  proposals: ActionProposal[];
  onRetry: () => void;
  renderItem: ListRenderItem<ActionProposal>;
}>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";

  if (isPending) {
    return (
      <View className="flex-1 pt-1">
        {SKELETON_ROWS.map((i) => (
          <RowSkeleton key={i} />
        ))}
        <View className="items-center pt-2">
          <ActivityIndicator color={light ? "#6D28D9" : "#A78BFA"} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center">
        <ErrorNote message={t("common.errorGeneric")} onRetry={onRetry} />
      </View>
    );
  }

  if (proposals.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ListEmptyState title={t("autopilot.empty")} />
      </View>
    );
  }

  return (
    <FlashList
      data={proposals}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      getItemType={(item) => item.kind}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    />
  );
}
