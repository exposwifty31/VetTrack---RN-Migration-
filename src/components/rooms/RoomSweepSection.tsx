/**
 * Room-sweep UI, decomposed into focused pieces the RoomDetail FlashList
 * composes (rn-best-practices: the worklist renders through a FlashList `data`
 * model, never `.map` inside a ScrollView — see RoomDetailScreen). This file
 * owns the fixed chrome that rides the list header/footer plus the per-row
 * renderers; the item collection itself is the FlashList `data`.
 *
 *   - `SweepHeader`       → ListHeaderComponent tail: title, homed count, the
 *     last-commit result banner, and (in sweep mode) the summary + bulk toggles.
 *   - `SweepStatus`       → ListEmptyComponent: honest pending / error / empty.
 *   - `SweepListRowView`  → renderItem body (section label OR one item row).
 *   - `SweepFooter`       → ListFooterComponent head: not-found error + the
 *     action bar (commit/cancel while sweeping, else start + bulk-verify).
 *
 * Aurora: opaque rows on the aurora background (the RoomsScreen/HomeScreen list
 * grammar), zero blur. Danger tokens appear only as static bucket chips; the
 * commit CTA is the prominent primary.
 */
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { PrimaryButton, QuietButton, SectionTitle } from "@/components/equipment/detail/DetailBits";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { isInsufficientRoleError, type SweepCommitResult } from "@/lib/api/docking";

import {
  sweepSummary,
  type SweepListRow,
  type SweepSectionLabelKey,
  type SweepSummary,
} from "./rooms-derive";
import { SweepItemRow } from "./SweepItemRow";
import type { UseRoomSweep } from "./useRoomSweep";

type CommitMutation = UseRoomSweep["commit"];
type BulkVerifyMutation = UseRoomSweep["bulkVerify"];

/** Green last-commit summary banner (survives the sweep-mode reset). */
function SweepResultBanner({ result }: Readonly<{ result: SweepCommitResult }>) {
  const { t } = useTranslation();
  const skippedSuffix =
    result.skippedNoStationCount > 0
      ? ` · ${t("roomDetail.sweep.resultSkipped", { skipped: result.skippedNoStationCount })}`
      : "";
  return (
    <View className="mb-2 rounded-md border border-border bg-surface-raised px-3 py-2">
      <Text className="font-rubik-semibold text-[13px] text-success">
        {t("roomDetail.sweep.result", {
          confirmed: result.confirmedCount,
          missing: result.missingCount,
        })}
        {skippedSuffix}
      </Text>
    </View>
  );
}

/** Sweep-mode present/missing tally + the confirm-all / clear-all shortcuts. */
function SweepControls({
  summary,
  onConfirmAll,
  onClearAll,
}: Readonly<{ summary: SweepSummary; onConfirmAll: () => void; onClearAll: () => void }>) {
  const { t } = useTranslation();
  return (
    <View className="mb-2 flex-row items-center justify-between gap-3">
      <Text className="font-rubik-semibold text-[13px] text-foreground">
        {t("roomDetail.sweep.summary", { present: summary.present, missing: summary.missing })}
      </Text>
      <View className="flex-row gap-2">
        <QuietButton label={t("roomDetail.sweep.confirmAll")} onPress={onConfirmAll} />
        <QuietButton label={t("roomDetail.sweep.clearAll")} onPress={onClearAll} />
      </View>
    </View>
  );
}

/** Fixed chrome above the sweep list: title, homed count, banner, controls. */
export function SweepHeader({ sweep }: Readonly<{ sweep: UseRoomSweep }>) {
  const { t } = useTranslation();
  const { items, sweeping, confirmedIds, commit, confirmAll, clearAll } = sweep;
  const summary = sweepSummary(items, confirmedIds);
  const hasItems = items.length > 0;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <SectionTitle title={t("roomDetail.sweep.title")} />
        {hasItems ? (
          <Text
            className="font-rubik text-[12px] text-muted"
            style={{ writingDirection: "ltr" }}
          >
            {t("roomDetail.homedCount", { count: items.length })}
          </Text>
        ) : null}
      </View>
      {hasItems && commit.data ? <SweepResultBanner result={commit.data} /> : null}
      {sweeping ? (
        <SweepControls summary={summary} onConfirmAll={confirmAll} onClearAll={clearAll} />
      ) : null}
    </View>
  );
}

/** ListEmptyComponent: the sweep list's honest pending / error / empty states. */
export function SweepStatus({
  worklistQuery,
}: Readonly<{ worklistQuery: UseRoomSweep["worklistQuery"] }>) {
  const { t } = useTranslation();
  if (worklistQuery.isPending) {
    return (
      <View>
        <RowSkeleton />
        <RowSkeleton />
      </View>
    );
  }
  if (worklistQuery.isError) {
    return (
      <ErrorNote
        message={t("roomDetail.sweep.loadError")}
        onRetry={() => void worklistQuery.refetch()}
      />
    );
  }
  return (
    <ListEmptyState title={t("roomDetail.sweep.empty")} body={t("roomDetail.sweep.emptyBody")} />
  );
}

/** A section-divider label row (no-station / accounted groups). */
function SweepSectionLabel({ labelKey }: Readonly<{ labelKey: SweepSectionLabelKey }>) {
  const { t } = useTranslation();
  return (
    <Text className="mb-1 mt-2 font-rubik-semibold text-[12px] text-text-tertiary">
      {t(labelKey)}
    </Text>
  );
}

/** renderItem body: a section label or one sweep item row. */
export function SweepListRowView({
  row,
  sweeping,
  confirmed,
  notFoundPending,
  onToggle,
  onNotFound,
}: Readonly<{
  row: SweepListRow;
  sweeping: boolean;
  confirmed: boolean;
  notFoundPending: boolean;
  onToggle: (id: string) => void;
  onNotFound: (id: string) => void;
}>) {
  if (row.kind === "label") return <SweepSectionLabel labelKey={row.labelKey} />;
  return (
    <SweepItemRow
      item={row.item}
      sweeping={sweeping}
      confirmed={confirmed}
      onToggle={onToggle}
      onNotFound={onNotFound}
      notFoundPending={notFoundPending}
    />
  );
}

/** Commit / cancel actions while a sweep is open. */
function SweepCommitActions({
  commit,
  onCancel,
}: Readonly<{ commit: CommitMutation; onCancel: () => void }>) {
  const { t } = useTranslation();
  return (
    <>
      <PrimaryButton
        label={commit.isPending ? t("roomDetail.sweep.committing") : t("roomDetail.sweep.commit")}
        disabled={commit.isPending}
        onPress={() => commit.mutate()}
      />
      <QuietButton label={t("common.cancel")} disabled={commit.isPending} onPress={onCancel} />
      {commit.isError ? (
        <Text className="text-center font-rubik text-[13px] text-danger">
          {t("roomDetail.sweep.commitError")}
        </Text>
      ) : null}
    </>
  );
}

/** The off-shift / error note under the bulk-verify shortcut. */
function BulkVerifyNote({ offShift, isError }: Readonly<{ offShift: boolean; isError: boolean }>) {
  const { t } = useTranslation();
  if (offShift) {
    return (
      <Text className="text-center font-rubik text-[13px] text-muted">{t("common.offShift")}</Text>
    );
  }
  if (isError) {
    return (
      <Text className="text-center font-rubik text-[13px] text-danger">
        {t("roomDetail.bulkVerifyError")}
      </Text>
    );
  }
  return null;
}

/** Start-sweep primary + the technician+ bulk-verify shortcut. */
function SweepStartActions({
  canBulkVerify,
  bulkVerify,
  offShift,
  onStart,
}: Readonly<{
  canBulkVerify: boolean;
  bulkVerify: BulkVerifyMutation;
  offShift: boolean;
  onStart: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <>
      <PrimaryButton label={t("roomDetail.sweep.start")} onPress={onStart} />
      {canBulkVerify ? (
        <QuietButton
          label={
            bulkVerify.isSuccess ? t("roomDetail.bulkVerifyDone") : t("roomDetail.bulkVerify")
          }
          disabled={bulkVerify.isPending || bulkVerify.isSuccess}
          onPress={() => bulkVerify.mutate()}
        />
      ) : null}
      <BulkVerifyNote offShift={offShift} isError={bulkVerify.isError} />
    </>
  );
}

/**
 * ListFooterComponent head: the not-found error + the action bar. Renders
 * nothing when the worklist has no items — the action bar lived inside the
 * items-present branch of the pre-FlashList card, so pending/error/empty
 * states show no actions.
 */
export function SweepFooter({
  sweep,
  canBulkVerify,
}: Readonly<{ sweep: UseRoomSweep; canBulkVerify: boolean }>) {
  const { t } = useTranslation();
  const { items, sweeping, commit, cancelSweep, startSweep, bulkVerify, notFoundError } = sweep;
  if (items.length === 0) return null;
  const bulkVerifyOffShift = bulkVerify.isError && isInsufficientRoleError(bulkVerify.error);

  return (
    <View>
      {notFoundError ? (
        <Text className="mt-1 font-rubik text-[12px] text-danger">
          {t("roomDetail.sweep.notFoundError")}
        </Text>
      ) : null}
      <View className="mt-3 gap-2">
        {sweeping ? (
          <SweepCommitActions commit={commit} onCancel={cancelSweep} />
        ) : (
          <SweepStartActions
            canBulkVerify={canBulkVerify}
            bulkVerify={bulkVerify}
            offShift={bulkVerifyOffShift}
            onStart={startSweep}
          />
        )}
      </View>
    </View>
  );
}
