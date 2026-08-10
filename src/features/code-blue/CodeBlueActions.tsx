/**
 * Code Blue MUTATION action bar (G4-5) — start / log / end / presence.
 * Renders ABOVE the frozen read-only `CodeBlueViewer` (see `EmergencyScreen`),
 * which stays exactly as merged in G4-1: this component owns every write
 * affordance so the viewer's read-only boundary is untouched.
 *
 * Emergency doctrine (matches `CodeBlueViewer`'s header comment): ZERO
 * glass/translucency, ZERO animation. Buttons here are static `Pressable`
 * with `active:opacity` only — never `PressableScale`.
 *
 * Reuses the SAME `codeBlueKeys.active()` query as `CodeBlueViewer` (identical
 * queryKey + queryFn — react-query dedupes to one shared cache entry, so
 * mounting both costs one network request, not two).
 *
 * DOCTRINE — session end is SERVER-CONFIRMED, never optimistic: every branch
 * below derives "is there an active session" EXCLUSIVELY from `sessionQuery.data`
 * (the query cache). `mutations.end.isSuccess` is used ONLY to render a
 * transient "ending…" label on the button itself — it never gates which
 * branch of this component renders. The active/no-active session view only
 * flips once `codeBlueKeys.active()` actually refetches (invalidated by the
 * mutation's `onSuccess` and/or the SSE hook already mounted by the viewer)
 * and the server returns `session: null`.
 *
 * Scope decisions for this slice (documented for the Lead — see PR body):
 *   - Start self-designates the current user as manager and is gated to the
 *     "vet" role client-side (the only role that is both a valid initiator
 *     AND a valid manager per server/routes/code-blue.ts). Nominating a
 *     DIFFERENT manager needs a user-picker; out of scope here.
 *   - Log entries are freeform "note" category only; an equipment picker for
 *     "equipment" category entries is a future slice.
 */
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Crypto from "expo-crypto";

import { useIdentity } from "@/app/useIdentity";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import type { ActiveCodeBlueResponse, CodeBlueSessionOutcome } from "@/types/code-blue";

import {
  canEndCodeBlue,
  canStartCodeBlue,
  codeBlueMutationErrorKey,
  computeElapsedMsForLog,
  type CodeBlueMutationErrorKey,
} from "./code-blue-actions-derive";
import { useCodeBlueMutations } from "./useCodeBlueMutations";

const OUTCOMES: readonly CodeBlueSessionOutcome[] = ["rosc", "died", "transferred", "ongoing"];

function ActionButton({
  label,
  onPress,
  disabled,
  testID,
}: Readonly<{ label: string; onPress: () => void; disabled?: boolean; testID?: string }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      className={`min-h-[44px] items-center justify-center rounded-md bg-danger-solid px-5 py-2.5 active:opacity-80 ${
        disabled ? "opacity-40" : ""
      }`}
      onPress={onPress}
    >
      <Text className="font-rubik-semibold text-[15px] text-white">{label}</Text>
    </Pressable>
  );
}

function ErrorBanner({ errorKey }: Readonly<{ errorKey: CodeBlueMutationErrorKey }>) {
  const { t } = useTranslation();
  const isOffline = errorKey === "codeBlue.errors.offline";
  return (
    <Text
      testID={isOffline ? "code-blue-offline-banner" : "code-blue-error-banner"}
      className="rounded-md border border-danger bg-surface px-3 py-2 text-center font-rubik-bold text-[13px] text-danger"
    >
      {t(errorKey)}
    </Text>
  );
}

export function CodeBlueActions() {
  const { t } = useTranslation();
  const identity = useIdentity();
  const sessionQuery = useQuery({
    queryKey: codeBlueKeys.active(),
    queryFn: codeBlueApi.active,
  });
  const mutations = useCodeBlueMutations();

  const [note, setNote] = useState("");
  const [endOpen, setEndOpen] = useState(false);
  const [outcome, setOutcome] = useState<CodeBlueSessionOutcome>("rosc");

  // Identity + the (shared) session query must resolve before any action can
  // be gated correctly — CodeBlueViewer already renders its own loading state
  // for the latter, so this bar simply stays absent until both are ready.
  if (identity.isPending || sessionQuery.isPending) return null;

  const response: ActiveCodeBlueResponse | undefined = sessionQuery.data;
  const session = response?.session ?? null;
  const currentUserId = identity.data?.id ?? null;
  const currentRole = identity.data?.role ?? null;

  if (!session) {
    const eligible = canStartCodeBlue(currentRole);
    // The server's startSessionSchema requires managerUserName.min(1) — never
    // fire Start with an empty name (would 400); the button simply stays
    // disabled rather than round-tripping a request that can't succeed.
    const managerUserName = (identity.data?.displayName ?? identity.data?.name ?? "").trim();
    const startErrorKey = mutations.start.isError
      ? codeBlueMutationErrorKey(mutations.start.error)
      : null;

    return (
      <View className="gap-2 px-5 pb-3" testID="code-blue-actions">
        {eligible ? (
          <ActionButton
            label={mutations.start.isPending ? t("codeBlue.actions.starting") : t("codeBlue.actions.start")}
            disabled={mutations.start.isPending || !managerUserName}
            onPress={() => {
              if (!currentUserId || !managerUserName) return;
              mutations.start.mutate({ managerUserId: currentUserId, managerUserName });
            }}
          />
        ) : (
          <Text className="text-center font-rubik text-[13px] text-text-tertiary">
            {t("codeBlue.actions.startRequiresVet")}
          </Text>
        )}
        {startErrorKey ? <ErrorBanner errorKey={startErrorKey} /> : null}
      </View>
    );
  }

  const isManager = canEndCodeBlue(currentUserId, session.managerUserId);
  const logErrorKey = mutations.addLogEntry.isError
    ? codeBlueMutationErrorKey(mutations.addLogEntry.error)
    : null;
  const endErrorKey = mutations.end.isError ? codeBlueMutationErrorKey(mutations.end.error) : null;
  const trimmedNote = note.trim();

  return (
    <View className="gap-3 px-5 pb-3" testID="code-blue-actions">
      <View className="gap-2">
        <TextInput
          testID="code-blue-log-input"
          className="min-h-[44px] rounded-md border border-border bg-surface px-3 py-2.5 font-rubik text-[14px] text-foreground"
          placeholder={t("codeBlue.actions.logPlaceholder")}
          value={note}
          onChangeText={setNote}
          accessibilityLabel={t("codeBlue.actions.logPlaceholder")}
        />
        <ActionButton
          label={mutations.addLogEntry.isPending ? t("codeBlue.actions.logging") : t("codeBlue.actions.addLog")}
          disabled={trimmedNote.length === 0 || mutations.addLogEntry.isPending}
          onPress={() => {
            mutations.addLogEntry.mutate({
              sessionId: session.id,
              payload: {
                idempotencyKey: Crypto.randomUUID(),
                elapsedMs: computeElapsedMsForLog(session.startedAt, Date.now()),
                label: trimmedNote,
                category: "note",
              },
            });
            setNote("");
          }}
        />
        {logErrorKey ? <ErrorBanner errorKey={logErrorKey} /> : null}
      </View>

      <ActionButton
        label={mutations.presence.isPending ? t("codeBlue.actions.joining") : t("codeBlue.actions.join")}
        disabled={mutations.presence.isPending}
        onPress={() => mutations.presence.mutate(session.id)}
      />

      {isManager ? (
        <View className="gap-2">
          {endOpen ? (
            <View className="gap-2" testID="code-blue-end-outcome-picker">
              <View className="flex-row flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <Pressable
                    key={o}
                    accessibilityRole="button"
                    accessibilityLabel={t(`codeBlue.outcome.${o}`)}
                    accessibilityState={{ selected: outcome === o }}
                    className={`min-h-[36px] items-center justify-center rounded-md border px-3 py-1.5 active:opacity-80 ${
                      outcome === o ? "border-danger bg-danger-solid" : "border-border bg-surface"
                    }`}
                    onPress={() => setOutcome(o)}
                  >
                    <Text
                      className={`font-rubik-semibold text-[13px] ${outcome === o ? "text-white" : "text-foreground"}`}
                    >
                      {t(`codeBlue.outcome.${o}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton
                label={mutations.end.isPending ? t("codeBlue.actions.ending") : t("codeBlue.actions.confirmEnd")}
                disabled={mutations.end.isPending}
                onPress={() => mutations.end.mutate({ sessionId: session.id, payload: { outcome } })}
              />
            </View>
          ) : (
            <ActionButton
              label={t("codeBlue.actions.end")}
              disabled={mutations.end.isPending}
              onPress={() => setEndOpen(true)}
            />
          )}
          {endErrorKey ? <ErrorBanner errorKey={endErrorKey} /> : null}
        </View>
      ) : null}
    </View>
  );
}
