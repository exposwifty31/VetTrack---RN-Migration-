/**
 * Code Blue read-only viewer — G4-1. Renders the currently-active Code Blue
 * session (or an honest "no active session" state) sourced from
 * `GET /api/code-blue/sessions/active` and kept fresh ONLY via the shared SSE
 * port (`useCodeBlueRealtimeSync`) — never a poll loop, never an optimistic
 * local update. This is display-only: no start/end/log/presence affordance
 * lives here (see `codeBlue.readOnlyNotice`).
 *
 * Emergency doctrine (matches the former EmergencyScreen placeholder + the
 * repo's `motion.ts`/`PressableScale.tsx` comments): ZERO glass/translucency,
 * ZERO animation. Static `active:opacity` presses only — never
 * `PressableScale`, never `AuroraBackground`.
 *
 * Log entries render through `FlashList` (CodeRabbit PR #47): a live
 * resuscitation can log an unbounded number of entries, and a `.map` inside a
 * `ScrollView` would eager-mount and re-render all of them on every SSE
 * invalidation. Presence stays a plain `View` — the server pre-filters it to a
 * 30s window, so it's inherently small.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { useCodeBlueRealtimeSync } from "@/hooks/useCodeBlueRealtimeSync";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import {
  deriveCodeBlueView,
  formatElapsedMs,
  type CodeBlueLogEntryView,
  type CodeBlueViewState,
} from "@/lib/code-blue-derive";

type ActiveView = Extract<CodeBlueViewState, { kind: "active" }>;

/**
 * Ticks once per second from `view.startedAt` (CodeRabbit PR #47 — a Code
 * Blue elapsed clock must never freeze between SSE-driven refetches; a stale
 * clock during a quiet stretch of a live resuscitation is a real defect, not
 * just cosmetic staleness). Seeded at 0 and set for real ONLY inside the
 * effect — `Date.now()` never runs during render, so this stays a pure render
 * per the repo's `react-hooks/purity` lint (caught once already on this file).
 */
function useTickingElapsedMs(startedAt: string): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const startMs = Date.parse(startedAt);
    // Invalid timestamp → zero elapsed, matching deriveCodeBlueView (never render NaN:NaN).
    const tick = () => setElapsedMs(Number.isFinite(startMs) ? Math.max(0, Date.now() - startMs) : 0);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsedMs;
}

function SessionHeader({ view }: Readonly<{ view: ActiveView }>) {
  const { t } = useTranslation();
  const elapsedMs = useTickingElapsedMs(view.startedAt);
  return (
    <View className="gap-3 rounded-2xl bg-danger-solid p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-rubik-bold text-[18px] text-white">{t("codeBlue.title")}</Text>
        <Text className="font-rubik-bold text-[20px] text-white">
          {formatElapsedMs(elapsedMs)}
        </Text>
      </View>
      <View className="gap-1">
        <Text className="font-rubik text-[13px] text-white/80">
          {t("codeBlue.manager")}: <Text className="font-rubik-semibold">{view.managerUserName}</Text>
        </Text>
        <Text className="font-rubik text-[13px] text-white/80">
          {t("codeBlue.startedBy")}: <Text className="font-rubik-semibold">{view.startedByName}</Text>
        </Text>
      </View>
    </View>
  );
}

function CartStatusRow({ cartStatus }: Readonly<{ cartStatus: ActiveView["cartStatus"] }>) {
  const { t } = useTranslation();
  if (!cartStatus) {
    return <Chip label={t("codeBlue.cartNotChecked")} tone="warning" />;
  }
  return (
    <Chip
      label={cartStatus.allPassed ? t("codeBlue.cartAllPassed") : t("codeBlue.cartIssues")}
      tone={cartStatus.allPassed ? "success" : "danger"}
    />
  );
}

function LogEntryRow({ entry }: Readonly<{ entry: CodeBlueLogEntryView }>) {
  return (
    <View className="mb-2 flex-row items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <View className="flex-1 gap-0.5">
        <Text className="font-rubik-semibold text-[14px] text-foreground">{entry.label}</Text>
        <Text className="font-rubik text-[12px] text-text-tertiary">{entry.loggedByName}</Text>
      </View>
      <Text className="font-rubik text-[13px] text-muted">{formatElapsedMs(entry.elapsedMs)}</Text>
    </View>
  );
}

// Defined outside the component so identity is stable across renders (avoids
// re-render churn on FlashList's renderItem — the repo's own FlashList
// precedent, `MyEquipmentScreen.tsx`, does the same).
const renderLogEntry: ListRenderItem<CodeBlueLogEntryView> = ({ item }) => (
  <LogEntryRow entry={item} />
);
const logEntryKeyExtractor = (entry: CodeBlueLogEntryView): string => entry.id;

function PresenceSection({ view }: Readonly<{ view: ActiveView }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Text className="font-rubik-semibold text-[14px] text-foreground">
        {t("codeBlue.presence")}
      </Text>
      {view.presence.length === 0 ? (
        <Text className="font-rubik text-[13px] text-muted">{t("codeBlue.noPresence")}</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {view.presence.map((p) => (
            <Chip key={p.userId} label={p.userName} tone="neutral" />
          ))}
        </View>
      )}
    </View>
  );
}

/** FlashList header: session card, cart status, and the "Log" section title. */
function ActiveSessionHeader({ view }: Readonly<{ view: ActiveView }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-4 pb-3">
      <SessionHeader view={view} />
      <CartStatusRow cartStatus={view.cartStatus} />
      <Text className="font-rubik-semibold text-[14px] text-foreground">
        {t("codeBlue.logEntries")}
      </Text>
    </View>
  );
}

/** FlashList footer: presence + the read-only notice — kept out of the virtualized item stream. */
function ActiveSessionFooter({ view }: Readonly<{ view: ActiveView }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-4 pt-3">
      <PresenceSection view={view} />
      <Text className="text-center font-rubik text-[12px] text-text-tertiary">
        {t("codeBlue.readOnlyNotice")}
      </Text>
    </View>
  );
}

function ActiveSession({ view }: Readonly<{ view: ActiveView }>) {
  const { t } = useTranslation();
  return (
    <FlashList
      data={view.logEntries}
      renderItem={renderLogEntry}
      keyExtractor={logEntryKeyExtractor}
      ListHeaderComponent={<ActiveSessionHeader view={view} />}
      ListFooterComponent={<ActiveSessionFooter view={view} />}
      ListEmptyComponent={
        <Text className="font-rubik text-[13px] text-muted">{t("codeBlue.noLogEntries")}</Text>
      }
      contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24 }}
    />
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-3 py-10">
      <ActivityIndicator />
      <Text className="text-[14px] text-muted">{t("common.loading")}</Text>
    </View>
  );
}

function LoadErrorState({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-6 py-8">
      <Text className="text-center font-rubik text-[15px] text-danger">
        {t("codeBlue.loadError")}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5 active:opacity-80"
        onPress={onRetry}
      >
        <Text className="font-rubik-semibold text-[15px] text-foreground">
          {t("common.retry")}
        </Text>
      </Pressable>
    </View>
  );
}

function NoActiveSessionState() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 gap-4 px-5 py-6">
      <ListEmptyState
        title={t("codeBlue.noActiveSession")}
        body={t("codeBlue.noActiveSessionBody")}
      />
      <Text className="text-center font-rubik text-[12px] text-text-tertiary">
        {t("codeBlue.readOnlyNotice")}
      </Text>
    </View>
  );
}

/** Read-only body — assumes identity has already resolved (caller self-gates). */
export function CodeBlueViewer() {
  useCodeBlueRealtimeSync();

  const query = useQuery({
    queryKey: codeBlueKeys.active(),
    queryFn: codeBlueApi.active,
  });

  // `dataUpdatedAt` changes only when a fetch actually lands (mount, or an SSE
  // invalidation triggered a refetch) — never a ticking interval. The session
  // snapshot itself is therefore only ever as fresh as the last
  // SERVER-confirmed read (no optimistic local state); the elapsed CLOCK
  // display is a separate concern handled by `useTickingElapsedMs` above.
  const view = useMemo(() => {
    if (!query.data) return null;
    return deriveCodeBlueView(query.data, query.dataUpdatedAt);
  }, [query.data, query.dataUpdatedAt]);

  // Early-return-shaped branch selection (no nested ternary — CodeRabbit
  // PR #47) assigned once, so the outer wrapper renders exactly once below.
  let body: ReactNode;
  if (query.isPending) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <LoadErrorState onRetry={() => void query.refetch()} />;
  } else if (view?.kind === "active") {
    body = <ActiveSession view={view} />;
  } else {
    body = <NoActiveSessionState />;
  }

  return <View className="flex-1 bg-background">{body}</View>;
}
