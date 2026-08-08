/**
 * Shift handover (G3 Slice 9) — a document-style READ surface for the latest
 * scheduler-generated handover artifact, with a single confirm CTA
 * (acknowledge / unconfirm). There is NO generate button and no generate call:
 * generation is server-scheduler-only (frozen R-SH-F1).
 *
 * The document is one top-level FlashList (rn-best-practices
 * `list-performance-virtualize` + `list-performance-item-types`): the fixed
 * header/summary ride `ListHeaderComponent`, the confirm CTA rides
 * `ListFooterComponent`, and the two unbounded server collections
 * (`openItems`, `patientWorklist.entries`) flow through one heterogeneous
 * `data` array (`buildHandoffRows`) with `getItemType` for per-type recycling —
 * never `.map`-mounted inside a ScrollView. Each row is an opaque SectionCard
 * (the ActivityFeed row grammar; SectionCard doctrine = content cards never sit
 * on glass), so the read surface stays a document you scroll top-to-bottom.
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
import { memo, useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
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
  buildHandoffRows,
  handoverDeltaCounts,
  isHandoverAcknowledged,
  type HandoffListRow,
} from "@/lib/api/shift-handover-derive";
import {
  isHandoverForbiddenError,
  shiftHandoverApi,
  shiftHandoverKeys,
  type HandoverArtifact,
  type PatientWorklistErrorCode,
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

// Literal key unions pulled off the row union so `t()` keeps its typed keys.
type HeadingKey = Extract<HandoffListRow, { type: "heading" }>["titleKey"];
type WorklistMessageKey = Extract<HandoffListRow, { type: "worklistMessage" }>["messageKey"];

/**
 * Row renderers — module-scope + memoized so FlashList recycling stays cheap
 * (rn-best-practices `list-performance-item-memo`). Each is an opaque card.
 */
const HeadingRow = memo(function HeadingRow({ titleKey }: Readonly<{ titleKey: HeadingKey }>) {
  const { t } = useTranslation();
  return (
    <View className="mb-3 mt-1">
      <SectionTitle title={t(titleKey)} />
    </View>
  );
});

const OpenItemRow = memo(function OpenItemRow({ summary }: Readonly<{ summary: string }>) {
  return (
    <SectionCard className="mb-3">
      {/* Human-readable carry-over — arbitrary clinic content, flows with layout direction. */}
      <Text className="font-rubik text-[14px] text-foreground">{summary}</Text>
    </SectionCard>
  );
});

const WorklistMessageRow = memo(function WorklistMessageRow({
  messageKey,
  code,
  tone,
}: Readonly<{
  messageKey: WorklistMessageKey;
  code: PatientWorklistErrorCode | null;
  tone: "muted" | "danger";
}>) {
  const { t } = useTranslation();
  return (
    <SectionCard className="mb-3">
      <Text
        className={`font-rubik text-[13px] ${tone === "danger" ? "text-danger" : "text-muted"}`}
      >
        {code ? t(messageKey, { code }) : t(messageKey)}
      </Text>
    </SectionCard>
  );
});

const WorklistEntryRow = memo(function WorklistEntryRow({
  display,
  externalId,
  techName,
}: Readonly<{ display: string; externalId: string; techName: string | null }>) {
  const { t } = useTranslation();
  return (
    <SectionCard className="mb-3">
      {/* display = PMS label (arbitrary) flows with layout; externalId = Latin id → ltr. */}
      <Text className="font-rubik text-[14px] text-foreground">{display}</Text>
      <View className="mt-0.5 flex-row items-center justify-between gap-2">
        <Text
          className="font-rubik text-[12px] text-text-tertiary"
          style={{ writingDirection: "ltr" }}
        >
          {ltrIsolate(externalId)}
        </Text>
        {techName ? (
          <Text className="font-rubik text-[12px] text-muted" numberOfLines={1}>
            {/* techName is localized staff data (may be Hebrew) — pass through, never LTR-isolate. */}
            {t("handoff.worklist.byTech", { name: techName })}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
});

const renderHandoffRow: ListRenderItem<HandoffListRow> = ({ item }) => {
  switch (item.type) {
    case "heading":
      return <HeadingRow titleKey={item.titleKey} />;
    case "openItem":
      return <OpenItemRow summary={item.summary} />;
    case "worklistMessage":
      return <WorklistMessageRow messageKey={item.messageKey} code={item.code} tone={item.tone} />;
    case "worklistEntry":
      return (
        <WorklistEntryRow
          display={item.display}
          externalId={item.externalId}
          techName={item.techName}
        />
      );
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
};

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

  const rows = useMemo(() => (handover ? buildHandoffRows(handover) : []), [handover]);

  return (
    <View className="flex-1 bg-background">
      <AuroraBackground />
      {handoverQuery.isPending ? (
        <View className="px-[22px] pt-3">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : handoverQuery.isError ? (
        <View className="flex-1 justify-center px-[22px]">
          <ErrorNote
            message={t("handoff.loadError")}
            onRetry={() => void handoverQuery.refetch()}
          />
        </View>
      ) : handover ? (
        <View className="flex-1">
          <FlashList
            data={rows}
            renderItem={renderHandoffRow}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.type}
            ListHeaderComponent={
              <View>
                <View className="mb-3">
                  <HeaderCard handover={handover} />
                </View>
                <View className="mb-3">
                  <SummaryCard handover={handover} />
                </View>
              </View>
            }
            ListFooterComponent={
              <AcknowledgeCard
                handover={handover}
                onAcknowledge={() => acknowledge.mutate(handover.id)}
                onUnconfirm={() => unconfirm.mutate(handover.id)}
                pending={pending}
                errorMessage={actionErrorMessage}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40 }}
          />
        </View>
      ) : (
        <View className="flex-1 justify-center px-[22px]">
          <ListEmptyState title={t("handoff.noneYet")} />
        </View>
      )}
    </View>
  );
}
