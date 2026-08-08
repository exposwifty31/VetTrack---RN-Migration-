/**
 * Restock sheet (G3 Slice 10) — the WORKING restock/blind-audit path. The
 * container-level `POST /:id/restock` + `/:id/blind-audit` endpoints are
 * disabled server-side (409 LEGACY_RESTOCK_DISABLED), so this drives the
 * `/api/restock/*` SESSION program (student floor). The per-item absolute
 * observed count IS the blind physical audit; nothing mutates stock until
 * Finish (the server's `finishSession` is the only commit point).
 *
 * Uses the Slice-1 `BottomSheet` (the screen's one T2 blur — mutually exclusive
 * with the dispense sheet, so ≤1 blur holds). Steppers give press feedback
 * (non-danger); no content/layout animation.
 *
 * Structured as small named children (RestockLineRow / RestockIntro /
 * RestockForm) with an `if/else if` phase dispatch, so the composition root
 * stays branch-light (SonarCloud cognitive-complexity gate).
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PrimaryButton, QuietButton } from "@/components/equipment/detail/DetailBits";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import {
  containerKeys,
  isSessionAlreadyActive,
  restockApi,
  retryUnlessClientError,
} from "@/lib/api/containers";
import type { ContainerInventoryLine, ContainerInventoryView } from "@/types/containers";

import { QuantityStepper } from "./QuantityStepper";

const RESTOCK_MAX = 999;

type RestockErrorKey = "restock.error" | "restock.scanError" | null;

export type RestockSheetTarget = Readonly<{ id: string; name: string }>;

type RestockSheetProps = Readonly<{
  container: RestockSheetTarget;
  onClose: () => void;
}>;

/** The line's effective observed count: an unsaved local edit wins, else the
 * server's session count, else the current on-hand (a sensible starting count). */
function effectiveObserved(line: ContainerInventoryLine, counts: Record<string, number>): number {
  const itemId = line.itemId;
  if (itemId != null && counts[itemId] !== undefined) return counts[itemId];
  return line.sessionObservedQuantity ?? line.actual;
}

/**
 * Commit each touched line's observed count to the session, then finish (the
 * sole commit point). A line is skipped when untouched, or when its edit equals
 * the count the server already holds — so a retry never re-scans unchanged rows.
 */
async function commitRestockCounts(
  sessionId: string,
  lines: readonly ContainerInventoryLine[],
  counts: Record<string, number>,
): Promise<void> {
  for (const line of lines) {
    const itemId = line.itemId as string;
    const observed = counts[itemId];
    if (observed === undefined) continue;
    if (observed === (line.sessionObservedQuantity ?? line.actual)) continue;
    await restockApi.scan(sessionId, itemId, observed);
  }
  await restockApi.finish(sessionId);
}

/** One countable line: label + expected/on-hand context + the observed stepper. */
function RestockLineRow({
  label,
  expected,
  onHand,
  value,
  onChange,
}: Readonly<{
  label: string;
  expected: number;
  onHand: number;
  value: number;
  onChange: (next: number) => void;
}>) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-2.5">
      <View className="flex-1">
        <Text className="font-rubik-medium text-[14px] text-foreground" numberOfLines={2}>
          {label}
        </Text>
        <Text className="mt-0.5 font-rubik text-[11px] text-text-tertiary">
          {t("restock.expected")}{" "}
          <Text style={{ writingDirection: "ltr" }}>{expected}</Text>
          {"   "}
          {t("restock.onHand")}{" "}
          <Text style={{ writingDirection: "ltr" }}>{onHand}</Text>
        </Text>
      </View>
      <QuantityStepper
        value={value}
        max={RESTOCK_MAX}
        onChange={onChange}
        decrementLabel={t("inventory.decrease")}
        incrementLabel={t("inventory.increase")}
      />
    </View>
  );
}

/** No open session yet: the intro copy + the Start-session entry point. */
function RestockIntro({
  errorKey,
  starting,
  onStart,
  onClose,
}: Readonly<{
  errorKey: RestockErrorKey;
  starting: boolean;
  onStart: () => void;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <View className="mt-4">
      <Text className="font-rubik text-[13px] text-muted">{t("restock.intro")}</Text>
      {errorKey ? (
        <Text className="mt-3 font-rubik-semibold text-[14px] text-danger light:text-[#B91C1C]">
          {t(errorKey)}
        </Text>
      ) : null}
      <View className="mt-4">
        <PrimaryButton
          label={starting ? t("restock.starting") : t("restock.start")}
          onPress={onStart}
          disabled={starting}
        />
      </View>
      <View className="mt-2.5">
        <QuietButton label={t("dispense.close")} onPress={onClose} />
      </View>
    </View>
  );
}

type RestockFormProps = Readonly<{
  progress: ContainerInventoryView["sessionProgress"];
  lines: readonly ContainerInventoryLine[];
  counts: Record<string, number>;
  onSetCount: (itemId: string, next: number) => void;
  errorKey: RestockErrorKey;
  busy: boolean;
  finishing: boolean;
  onFinish: () => void;
  onCancel: () => void;
}>;

/** Open session: the per-item observed-count list + finish / cancel controls. */
function RestockForm({
  progress,
  lines,
  counts,
  onSetCount,
  errorKey,
  busy,
  finishing,
  onFinish,
  onCancel,
}: RestockFormProps) {
  const { t } = useTranslation();
  return (
    <View className="mt-4">
      {progress ? (
        <Text className="mb-2 font-rubik text-[12px] text-text-tertiary">
          {t("restock.progress", {
            scanned: progress.scannedCount,
            total: progress.totalCount,
          })}
        </Text>
      ) : null}

      <ScrollView
        style={{ maxHeight: 260 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {lines.map((line) => {
          const itemId = line.itemId as string;
          return (
            <RestockLineRow
              key={itemId}
              label={line.label}
              expected={line.expected}
              onHand={line.actual}
              value={effectiveObserved(line, counts)}
              onChange={(next) => onSetCount(itemId, next)}
            />
          );
        })}
      </ScrollView>

      {errorKey ? (
        <Text className="mt-3 font-rubik-semibold text-[14px] text-danger light:text-[#B91C1C]">
          {t(errorKey)}
        </Text>
      ) : null}

      <View className="mt-5">
        <PrimaryButton
          label={finishing ? t("restock.finishing") : t("restock.finish")}
          onPress={onFinish}
          disabled={busy}
        />
      </View>
      <View className="mt-2.5">
        <QuietButton label={t("restock.cancelSession")} onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

export function RestockSheet({ container, onClose }: RestockSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const viewQuery = useQuery({
    queryKey: containerKeys.items(container.id),
    queryFn: () => restockApi.containerItems(container.id),
    retry: retryUnlessClientError,
  });

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [errorKey, setErrorKey] = useState<RestockErrorKey>(null);

  const view = viewQuery.data;
  const activeSession = view?.activeSession ?? null;
  const countableLines = useMemo(
    () => (view?.lines ?? []).filter((line) => line.itemId != null),
    [view],
  );

  const invalidateItems = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: containerKeys.items(container.id) });
  }, [queryClient, container.id]);

  const startMutation = useMutation({
    mutationFn: () => restockApi.start(container.id),
    onSuccess: invalidateItems,
    onError: (error: unknown) => {
      // An already-open session isn't an error — resume it by refetching.
      if (isSessionAlreadyActive(error)) invalidateItems();
      else setErrorKey("restock.error");
    },
  });

  const finishMutation = useMutation({
    // Commit each touched line's observed count, then finish (the sole commit).
    mutationFn: (sessionId: string) => commitRestockCounts(sessionId, countableLines, counts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: containerKeys.all });
      onClose();
    },
    onError: () => setErrorKey("restock.scanError"),
  });

  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) => restockApi.cancel(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: containerKeys.all });
      onClose();
    },
    onError: () => setErrorKey("restock.error"),
  });

  const setCount = useCallback((itemId: string, next: number) => {
    setCounts((prev) => ({ ...prev, [itemId]: next }));
    setErrorKey(null);
  }, []);

  const busy = finishMutation.isPending || cancelMutation.isPending;

  let body: ReactNode;
  if (viewQuery.isPending) {
    body = (
      <View className="mt-4">
        <RowSkeleton />
        <RowSkeleton />
      </View>
    );
  } else if (viewQuery.isError) {
    body = (
      <View className="mt-4">
        <ErrorNote message={t("restock.loadError")} onRetry={() => void viewQuery.refetch()} />
      </View>
    );
  } else if (!activeSession) {
    body = (
      <RestockIntro
        errorKey={errorKey}
        starting={startMutation.isPending}
        onStart={() => startMutation.mutate()}
        onClose={onClose}
      />
    );
  } else if (countableLines.length === 0) {
    body = (
      <View className="mt-4">
        <Text className="font-rubik text-[14px] text-muted">{t("restock.empty")}</Text>
        <View className="mt-4">
          <QuietButton label={t("dispense.close")} onPress={onClose} />
        </View>
      </View>
    );
  } else {
    body = (
      <RestockForm
        progress={view?.sessionProgress ?? null}
        lines={countableLines}
        counts={counts}
        onSetCount={setCount}
        errorKey={errorKey}
        busy={busy}
        finishing={finishMutation.isPending}
        onFinish={() => finishMutation.mutate(activeSession.id)}
        onCancel={() => cancelMutation.mutate(activeSession.id)}
      />
    );
  }

  return (
    // Claim any touch not consumed by a sheet child so a tap in the dimmed area
    // above the sheet cannot fall through to the live container rows behind
    // (children keep responder priority, so buttons + the drag gesture still work).
    <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true}>
      <BottomSheet onDismiss={onClose}>
        <Text className="font-rubik-bold text-[20px] text-foreground">{t("restock.title")}</Text>
        <Text
          className="mt-1 font-rubik-medium text-[15px] text-foreground"
          style={{ writingDirection: "ltr" }}
          numberOfLines={2}
        >
          {container.name}
        </Text>

        {body}
      </BottomSheet>
    </View>
  );
}
