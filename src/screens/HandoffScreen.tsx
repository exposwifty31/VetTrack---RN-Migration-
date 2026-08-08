/**
 * Shift handover (G3 Slice 9) — a document-style READ surface for the latest
 * scheduler-generated handover artifact, with a single confirm CTA
 * (acknowledge / unconfirm). There is NO generate button and no generate call:
 * generation is server-scheduler-only (frozen R-SH-F1).
 *
 * Aurora budget: ZERO blur layers — every section is an opaque SectionCard; the
 * acknowledged state uses a static semantic token (never animated). Reads via a
 * plain query (no polling, no realtime — Slice 9 has no domain event); the two
 * mutations follow the SERVER row (setQueryData from the returned artifact, then
 * invalidate) — the UI never optimistically flips the acknowledged state.
 *
 * The mutations are next-shift-roster authorized server-side, so a user who can
 * open this document may still 403 on acknowledge; that 403 cannot be pre-gated
 * (roster-, not role-based) and is surfaced as an inline note, never a raw throw.
 */
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AuroraBackground } from "@/components/home/AuroraBackground";
import {
  KeyValueRow,
  PrimaryButton,
  QuietButton,
  SectionTitle,
  ltrIsolate,
} from "@/components/equipment/detail/DetailBits";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { retryUnlessClientError } from "@/lib/api/coded-error";
import {
  handoverDeltaCounts,
  isHandoverAcknowledged,
  resolveStaffName,
} from "@/lib/api/shift-handover-derive";
import {
  isHandoverForbiddenError,
  shiftHandoverApi,
  shiftHandoverKeys,
  type HandoverArtifact,
} from "@/lib/api/shift-handover";
import { formatDateTime } from "@/lib/datetime";

function HeaderCard({ handover }: Readonly<{ handover: HandoverArtifact }>) {
  const { t } = useTranslation();
  const generatedWhen = formatDateTime(handover.generatedAt);
  return (
    <SectionCard>
      <Text className="font-rubik-bold text-[20px] text-foreground">{t("handoff.title")}</Text>
      {generatedWhen ? (
        <Text className="mt-1 font-rubik text-[13px] text-text-tertiary">
          {t("handoff.generatedAt", { when: generatedWhen })}
        </Text>
      ) : null}
      <View className="mt-1">
        <KeyValueRow label={t("handoff.revision")} value={String(handover.revision)} ltr />
      </View>
    </SectionCard>
  );
}

function SummaryCard({ handover }: Readonly<{ handover: HandoverArtifact }>) {
  const { t } = useTranslation();
  const counts = handoverDeltaCounts(handover);
  return (
    <SectionCard>
      <SectionTitle title={t("handoff.summary.title")} />
      <KeyValueRow label={t("handoff.summary.custody")} value={String(counts.custody)} ltr />
      <KeyValueRow label={t("handoff.summary.taskState")} value={String(counts.taskState)} ltr />
      <KeyValueRow label={t("handoff.summary.alerts")} value={String(counts.alerts)} ltr />
      <KeyValueRow label={t("handoff.summary.dispenses")} value={String(counts.dispenses)} ltr />
      <KeyValueRow
        label={t("handoff.summary.signals")}
        value={String(handover.observedSignals.length)}
        ltr
      />
    </SectionCard>
  );
}

function OpenItemsCard({ items }: Readonly<{ items: HandoverArtifact["openItems"] }>) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <SectionCard>
      <SectionTitle title={t("handoff.openItems.title")} />
      {items.map((item, index) => (
        <View
          key={item.id}
          className={index > 0 ? "mt-2 border-t border-border pt-2" : undefined}
        >
          {/* Human-readable carry-over — arbitrary clinic content, flows with layout direction. */}
          <Text className="font-rubik text-[14px] text-foreground">{item.summary}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

function WorklistCard({ handover }: Readonly<{ handover: HandoverArtifact }>) {
  const { t } = useTranslation();
  const worklist = handover.patientWorklist;
  return (
    <SectionCard>
      <SectionTitle title={t("handoff.worklist.title")} />
      {worklist.state === "not_configured" ? (
        <Text className="font-rubik text-[13px] text-muted">
          {t("handoff.worklist.notConfigured")}
        </Text>
      ) : worklist.state === "error" ? (
        <Text className="font-rubik text-[13px] text-danger">
          {t("handoff.worklist.error", { code: worklist.code })}
        </Text>
      ) : worklist.entries.length === 0 ? (
        <Text className="font-rubik text-[13px] text-muted">{t("handoff.worklist.empty")}</Text>
      ) : (
        worklist.entries.map((entry, index) => {
          const techName = resolveStaffName(handover.staff, entry.byTechId);
          return (
            <View
              key={`${entry.externalId}:${index}`}
              className={index > 0 ? "mt-2 border-t border-border pt-2" : undefined}
            >
              {/* display = PMS label (arbitrary) flows with layout; externalId = Latin id → ltr. */}
              <Text className="font-rubik text-[14px] text-foreground">{entry.display}</Text>
              <View className="mt-0.5 flex-row items-center justify-between gap-2">
                <Text
                  className="font-rubik text-[12px] text-text-tertiary"
                  style={{ writingDirection: "ltr" }}
                >
                  {ltrIsolate(entry.externalId)}
                </Text>
                {techName ? (
                  <Text className="font-rubik text-[12px] text-muted" numberOfLines={1}>
                    {t("handoff.worklist.byTech", { name: ltrIsolate(techName) })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

type AcknowledgeCardProps = Readonly<{
  handover: HandoverArtifact;
  onAcknowledge: () => void;
  onUnconfirm: () => void;
  pending: boolean;
  errorMessage: string | null;
}>;

function AcknowledgeCard({
  handover,
  onAcknowledge,
  onUnconfirm,
  pending,
  errorMessage,
}: AcknowledgeCardProps) {
  const { t } = useTranslation();
  const acknowledged = isHandoverAcknowledged(handover);
  const acknowledgedWhen = formatDateTime(handover.acknowledgedAt);
  return (
    <SectionCard className="mt-1">
      {acknowledged ? (
        <>
          <Text className="font-rubik-semibold text-[15px] text-success light:text-[#166534]">
            {acknowledgedWhen
              ? t("handoff.acknowledgedAt", { when: acknowledgedWhen })
              : t("handoff.acknowledgedState")}
          </Text>
          <View className="mt-3">
            <QuietButton label={t("handoff.unconfirm")} onPress={onUnconfirm} disabled={pending} />
          </View>
        </>
      ) : (
        <PrimaryButton label={t("handoff.acknowledge")} onPress={onAcknowledge} disabled={pending} />
      )}
      {errorMessage ? (
        <Text className="mt-2.5 text-center font-rubik text-[13px] text-danger">
          {errorMessage}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export function HandoffScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const handoverQuery = useQuery<HandoverArtifact | null>({
    queryKey: shiftHandoverKeys.current(),
    queryFn: () => shiftHandoverApi.getCurrent(),
    retry: retryUnlessClientError,
  });

  const applyServerRow = useCallback(
    (updated: HandoverArtifact) => {
      // Server-confirmed: adopt the returned row, then invalidate for freshness.
      queryClient.setQueryData(shiftHandoverKeys.current(), updated);
    },
    [queryClient],
  );

  const acknowledge = useMutation({
    mutationFn: (id: string) => shiftHandoverApi.acknowledge(id),
    onSuccess: applyServerRow,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: shiftHandoverKeys.all });
    },
  });

  const unconfirm = useMutation({
    mutationFn: (id: string) => shiftHandoverApi.unconfirm(id),
    onSuccess: applyServerRow,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: shiftHandoverKeys.all });
    },
  });

  const handover = handoverQuery.data;
  const pending = acknowledge.isPending || unconfirm.isPending;

  // Only one CTA is reachable per acknowledged-state, so surface only the
  // active mutation's error; a roster 403 becomes an inline note (never a toast/throw).
  const activeError = handover
    ? isHandoverAcknowledged(handover)
      ? unconfirm.error
      : acknowledge.error
    : null;
  const actionErrorMessage = activeError
    ? isHandoverForbiddenError(activeError)
      ? t("handoff.notAuthorized")
      : t("handoff.actionError")
    : null;

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {handoverQuery.isPending ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : handoverQuery.isError ? (
          <ErrorNote
            message={t("handoff.loadError")}
            onRetry={() => void handoverQuery.refetch()}
          />
        ) : handover ? (
          <>
            <HeaderCard handover={handover} />
            <SummaryCard handover={handover} />
            <OpenItemsCard items={handover.openItems} />
            <WorklistCard handover={handover} />
            <AcknowledgeCard
              handover={handover}
              onAcknowledge={() => acknowledge.mutate(handover.id)}
              onUnconfirm={() => unconfirm.mutate(handover.id)}
              pending={pending}
              errorMessage={actionErrorMessage}
            />
          </>
        ) : (
          <ListEmptyState title={t("handoff.noneYet")} />
        )}
      </ScrollView>
    </View>
  );
}
