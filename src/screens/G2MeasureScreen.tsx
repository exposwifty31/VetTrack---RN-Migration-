import { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  computeP95,
  getFrameBudgetMs,
  getFrameSample,
  measureTapServerConfirmed,
  measureTapVisualAck,
  measureTTI,
  resetFrameSamples,
  type FrameSample,
  type FrameSampleSource,
} from "@/lib/instrumentation/perf";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * G2 measurement readout + export (docs/g2-preregistration.md §6). Shows the
 * latest O3/O4 marks and the per-thread frame samples of the current run, and
 * exports one JSON per run via the system share sheet. The raw `deltasMs`
 * arrays ARE the reproducibility artifact — they get archived as
 * docs/g2-raw/<app>-run<NN>-<source>.json with their SHA-256 in the results CSV.
 * Fails loud when EXPO_PUBLIC_FRAME_BUDGET_MS is missing — never guesses 60 Hz.
 */
export function G2MeasureScreen(_props: RootStackScreenProps<"G2Measure">) {
  const { t } = useTranslation();
  const budgetMs = getFrameBudgetMs();
  const [run, setRun] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // Pull-based snapshot: reading the sink on demand keeps this screen out of the
  // measured path (no subscriptions, no re-renders during sampling).
  const [snapshot, setSnapshot] = useState(() => takeSnapshot());

  const refresh = useCallback(() => {
    setError(null);
    setSnapshot(takeSnapshot());
  }, []);

  const nextRun = useCallback(() => {
    resetFrameSamples();
    setRun((r) => r + 1);
    setError(null);
    setSnapshot(takeSnapshot());
  }, []);

  const exportRun = useCallback(async () => {
    if (budgetMs == null) {
      setError(t("g2.budgetMissing"));
      return;
    }
    const current = takeSnapshot();
    setSnapshot(current);
    const payload = {
      app: "rn",
      run,
      budgetMs,
      ttiMs: current.ttiMs,
      tapVisualAckMs: current.tapVisualAckMs,
      tapServerConfirmedMs: current.tapServerConfirmedMs,
      frames: { js: current.js, ui: current.ui },
      exportedAt: new Date().toISOString(),
    };
    // Deterministic capture channel for cable-driven measurement runs: the
    // payload also goes to the native log (adb logcat), so the raw arrays can
    // be archived without driving the share sheet. logcat truncates lines at
    // ~4KB, so the JSON is chunked with reassembly markers.
    const serialized = JSON.stringify(payload);
    const CHUNK = 3000;
    const total = Math.ceil(serialized.length / CHUNK);
    for (let i = 0; i < total; i += 1) {
      console.log(`G2CHUNK ${run} ${i + 1}/${total} ${serialized.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
    try {
      await Share.share({ message: JSON.stringify(payload) });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [budgetMs, run, t]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-6 py-6"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text className="text-2xl font-bold text-foreground">{t("g2.title")}</Text>
      <Text className="text-[14px] text-muted">{t("g2.subtitle", { run })}</Text>

      {budgetMs == null ? (
        <Text selectable className="text-[15px] font-semibold text-danger">
          {t("g2.budgetMissing")}
        </Text>
      ) : (
        <Stat label={t("g2.budget")} value={`${budgetMs} ms`} />
      )}

      <Stat label={t("g2.tti")} value={formatMs(snapshot.ttiMs)} />
      <Stat label={t("g2.tapAck")} value={formatMs(snapshot.tapVisualAckMs)} />
      <Stat label={t("g2.tapServer")} value={formatMs(snapshot.tapServerConfirmedMs)} />

      <FrameStats source="js" sample={snapshot.js} />
      <FrameStats source="ui" sample={snapshot.ui} />

      {error ? (
        <Text selectable className="text-[14px] font-semibold text-danger">
          {error}
        </Text>
      ) : null}

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={refresh}
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("g2.refresh")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={nextRun}
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("g2.nextRun")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => {
          void exportRun();
        }}
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          {t("g2.export")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function takeSnapshot() {
  return {
    ttiMs: measureTTI(),
    tapVisualAckMs: measureTapVisualAck(),
    tapServerConfirmedMs: measureTapServerConfirmed(),
    js: getFrameSample("js"),
    ui: getFrameSample("ui"),
  };
}

function formatMs(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <Text className="text-[14px] text-muted">{label}</Text>
      <Text selectable className="text-[15px] font-semibold text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

function FrameStats({ source, sample }: { source: FrameSampleSource; sample: FrameSample | null }) {
  const { t } = useTranslation();
  const p95 = sample ? computeP95(sample.deltasMs) : null;
  return (
    <View className="gap-1 rounded-xl border border-border bg-surface px-4 py-3">
      <Text className="text-[14px] font-semibold text-foreground">
        {t("g2.framesTitle", { source: source.toUpperCase() })}
      </Text>
      {sample == null ? (
        <Text className="text-[14px] text-muted">{t("g2.noSample")}</Text>
      ) : (
        <Text selectable className="text-[14px] text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          {t("g2.framesLine", {
            total: sample.framesTotal,
            over: sample.framesOverBudget,
            p95: p95 == null ? "—" : p95.toFixed(2),
          })}
        </Text>
      )}
    </View>
  );
}
