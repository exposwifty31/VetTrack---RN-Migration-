/**
 * Room contents + sweep flow: worklist → confirm-present checklist → commit,
 * plus per-item not-found-here and a technician+ bulk-verify shortcut.
 *
 * Aurora: opaque SectionCard, zero blur (the whole RoomDetail screen keeps a
 * zero-blur budget — the sweep is inline, not a modal, since the nav is frozen
 * and no transparentModal route can be added). The commit CTA is the prominent
 * primary; danger tokens appear only as static bucket chips.
 */
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { PrimaryButton, QuietButton, SectionTitle } from "@/components/equipment/detail/DetailBits";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import { SectionCard } from "@/components/ui/SectionCard";
import { isInsufficientRoleError } from "@/lib/api/docking";

import { sweepSummary } from "./rooms-derive";
import { SweepItemRow } from "./SweepItemRow";
import { useRoomSweep } from "./useRoomSweep";

type RoomSweepSectionProps = Readonly<{
  roomId: string;
  /** Pre-gated on `hasRoleAtLeast(effectiveRole, "technician")` by the screen. */
  canBulkVerify: boolean;
}>;

export function RoomSweepSection({ roomId, canBulkVerify }: RoomSweepSectionProps) {
  const { t } = useTranslation();
  const sweep = useRoomSweep(roomId);
  const {
    worklistQuery,
    items,
    sweepable,
    accounted,
    sweeping,
    confirmedIds,
    startSweep,
    cancelSweep,
    toggle,
    confirmAll,
    clearAll,
    commit,
    notFoundPendingId,
    reportNotFound,
    notFoundError,
    bulkVerify,
  } = sweep;

  const summary = sweepSummary(items, confirmedIds);
  const commitResult = commit.data;
  const bulkVerifyOffShift = bulkVerify.isError && isInsufficientRoleError(bulkVerify.error);

  const renderRow = (item: (typeof items)[number]) => (
    <SweepItemRow
      key={item.id}
      item={item}
      sweeping={sweeping}
      confirmed={confirmedIds.has(item.id)}
      onToggle={toggle}
      onNotFound={reportNotFound}
      notFoundPending={notFoundPendingId === item.id}
    />
  );

  return (
    <SectionCard>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <SectionTitle title={t("roomDetail.sweep.title")} />
        {items.length > 0 ? (
          <Text
            className="font-rubik text-[12px] text-muted"
            style={{ writingDirection: "ltr" }}
          >
            {t("roomDetail.homedCount", { count: items.length })}
          </Text>
        ) : null}
      </View>

      {worklistQuery.isPending ? (
        <View>
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : worklistQuery.isError ? (
        <ErrorNote
          message={t("roomDetail.sweep.loadError")}
          onRetry={() => void worklistQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <ListEmptyState
          title={t("roomDetail.sweep.empty")}
          body={t("roomDetail.sweep.emptyBody")}
        />
      ) : (
        <View className="gap-1">
          {/* Last-commit result banner (survives the mode reset). */}
          {commitResult ? (
            <View className="mb-2 rounded-md border border-border bg-surface-raised px-3 py-2">
              <Text className="font-rubik-semibold text-[13px] text-success">
                {t("roomDetail.sweep.result", {
                  confirmed: commitResult.confirmedCount,
                  missing: commitResult.missingCount,
                })}
                {commitResult.skippedNoStationCount > 0
                  ? ` · ${t("roomDetail.sweep.resultSkipped", {
                      skipped: commitResult.skippedNoStationCount,
                    })}`
                  : ""}
              </Text>
            </View>
          ) : null}

          {sweeping ? (
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <Text className="font-rubik-semibold text-[13px] text-foreground">
                {t("roomDetail.sweep.summary", {
                  present: summary.present,
                  missing: summary.missing,
                })}
              </Text>
              <View className="flex-row gap-2">
                <QuietButton label={t("roomDetail.sweep.confirmAll")} onPress={confirmAll} />
                <QuietButton label={t("roomDetail.sweep.clearAll")} onPress={clearAll} />
              </View>
            </View>
          ) : null}

          {/* Sweepable (resting) items. */}
          {sweepable.map(renderRow)}

          {/* Accounted (checked-out) items — read-only, D-9. */}
          {accounted.length > 0 ? (
            <>
              <Text className="mb-1 mt-2 font-rubik-semibold text-[12px] text-text-tertiary">
                {t("roomDetail.sweep.accounted")}
              </Text>
              {accounted.map(renderRow)}
            </>
          ) : null}

          {notFoundError ? (
            <Text className="mt-1 font-rubik text-[12px] text-danger">
              {t("roomDetail.sweep.notFoundError")}
            </Text>
          ) : null}

          {/* Action bar. */}
          <View className="mt-3 gap-2">
            {sweeping ? (
              <>
                <PrimaryButton
                  label={commit.isPending ? t("roomDetail.sweep.committing") : t("roomDetail.sweep.commit")}
                  disabled={commit.isPending}
                  onPress={() => commit.mutate()}
                />
                <QuietButton
                  label={t("common.cancel")}
                  disabled={commit.isPending}
                  onPress={cancelSweep}
                />
                {commit.isError ? (
                  <Text className="text-center font-rubik text-[13px] text-danger">
                    {t("roomDetail.sweep.commitError")}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <PrimaryButton label={t("roomDetail.sweep.start")} onPress={startSweep} />
                {canBulkVerify ? (
                  <QuietButton
                    label={
                      bulkVerify.isSuccess
                        ? t("roomDetail.bulkVerifyDone")
                        : t("roomDetail.bulkVerify")
                    }
                    disabled={bulkVerify.isPending || bulkVerify.isSuccess}
                    onPress={() => bulkVerify.mutate()}
                  />
                ) : null}
                {bulkVerifyOffShift ? (
                  <Text className="text-center font-rubik text-[13px] text-muted">
                    {t("common.offShift")}
                  </Text>
                ) : bulkVerify.isError ? (
                  <Text className="text-center font-rubik text-[13px] text-danger">
                    {t("roomDetail.bulkVerifyError")}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </View>
      )}
    </SectionCard>
  );
}
