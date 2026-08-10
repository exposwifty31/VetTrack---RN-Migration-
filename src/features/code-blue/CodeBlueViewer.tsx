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
 */
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/Chip";
import { ListEmptyState } from "@/components/ui/ListEmptyState";
import { useCodeBlueRealtimeSync } from "@/hooks/useCodeBlueRealtimeSync";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import {
  deriveCodeBlueView,
  formatElapsedMs,
  type CodeBlueViewState,
} from "@/lib/code-blue-derive";

function SessionHeader({ view }: { view: Extract<CodeBlueViewState, { kind: "active" }> }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 rounded-2xl bg-danger-solid p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-rubik-bold text-[18px] text-white">{t("codeBlue.title")}</Text>
        <Text className="font-rubik-bold text-[20px] text-white">
          {formatElapsedMs(view.elapsedMs)}
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

function CartStatusRow({ cartStatus }: { cartStatus: Extract<CodeBlueViewState, { kind: "active" }>["cartStatus"] }) {
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

function LogEntriesSection({ view }: { view: Extract<CodeBlueViewState, { kind: "active" }> }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Text className="font-rubik-semibold text-[14px] text-foreground">
        {t("codeBlue.logEntries")}
      </Text>
      {view.logEntries.length === 0 ? (
        <Text className="font-rubik text-[13px] text-muted">{t("codeBlue.noLogEntries")}</Text>
      ) : (
        <View className="gap-2">
          {view.logEntries.map((entry) => (
            <View
              key={entry.id}
              className="flex-row items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <View className="flex-1 gap-0.5">
                <Text className="font-rubik-semibold text-[14px] text-foreground">
                  {entry.label}
                </Text>
                <Text className="font-rubik text-[12px] text-text-tertiary">
                  {entry.loggedByName}
                </Text>
              </View>
              <Text className="font-rubik text-[13px] text-muted">
                {formatElapsedMs(entry.elapsedMs)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PresenceSection({ view }: { view: Extract<CodeBlueViewState, { kind: "active" }> }) {
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

function ActiveSessionContent({ view }: { view: Extract<CodeBlueViewState, { kind: "active" }> }) {
  return (
    <View className="gap-5">
      <SessionHeader view={view} />
      <CartStatusRow cartStatus={view.cartStatus} />
      <LogEntriesSection view={view} />
      <PresenceSection view={view} />
    </View>
  );
}

/** Read-only body — assumes identity has already resolved (caller self-gates). */
export function CodeBlueViewer() {
  const { t } = useTranslation();

  useCodeBlueRealtimeSync();

  const query = useQuery({
    queryKey: codeBlueKeys.active(),
    queryFn: codeBlueApi.active,
  });

  // `dataUpdatedAt` changes only when a fetch actually lands (mount, or an SSE
  // invalidation triggered a refetch) — never a ticking interval. Elapsed time
  // is therefore only ever as fresh as the last SERVER-confirmed read, matching
  // the "no optimistic local state" doctrine.
  const view = useMemo(() => {
    // `dataUpdatedAt` is only 0 before the first successful fetch, at which
    // point `query.data` is still undefined too — so whenever `query.data` is
    // set, `dataUpdatedAt` is already a real timestamp. No `Date.now()` fallback
    // needed (and none wanted: this stays a pure render, no impure clock read).
    if (!query.data) return null;
    return deriveCodeBlueView(query.data, query.dataUpdatedAt);
  }, [query.data, query.dataUpdatedAt]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow gap-4 px-5 py-6">
        {query.isPending ? (
          <View className="flex-1 items-center justify-center gap-3 py-10">
            <ActivityIndicator />
            <Text className="text-[14px] text-muted">{t("common.loading")}</Text>
          </View>
        ) : query.isError ? (
          <View className="flex-1 items-center justify-center gap-3 px-6 py-8">
            <Text className="text-center font-rubik text-[15px] text-danger">
              {t("codeBlue.loadError")}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-6 py-2.5 active:opacity-80"
              onPress={() => void query.refetch()}
            >
              <Text className="font-rubik-semibold text-[15px] text-foreground">
                {t("common.retry")}
              </Text>
            </Pressable>
          </View>
        ) : view?.kind === "active" ? (
          <ActiveSessionContent view={view} />
        ) : (
          <ListEmptyState
            title={t("codeBlue.noActiveSession")}
            body={t("codeBlue.noActiveSessionBody")}
          />
        )}
        <Text className="text-center font-rubik text-[12px] text-text-tertiary">
          {t("codeBlue.readOnlyNotice")}
        </Text>
      </ScrollView>
    </View>
  );
}
