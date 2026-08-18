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
 * CodeRabbit PR #49 — a FAILED read of `codeBlueKeys.active()` is "unknown",
 * NOT "no session": `sessionQuery.isError` is checked BEFORE the `!session`
 * branch and renders an error/retry state instead of ever offering Start,
 * so a transient read failure can never risk a double-start.
 *
 * Structured as small named sub-components (the `CodeBlueViewer` idiom —
 * `LoadingState`/`LoadErrorState`/etc.) to keep this file's cognitive
 * complexity low (CodeRabbit PR #49 flagged the previous single-function
 * version at 24 > the 15 SonarCloud gate); behavior is unchanged by the
 * extraction itself.
 *
 * Scope decisions for this slice (documented for the Lead — see PR body):
 *   - Start is gated on the TWO unconditional server gates separately (see the
 *     block comment in `code-blue-actions-derive.ts`): a vet self-designates as
 *     manager in one tap; a senior_technician/technician may initiate but must
 *     NOMINATE a vet/admin from GET /api/users/managers. Anyone outside the
 *     server's initiator allow-list sees the explanation and no affordance.
 *   - The candidate list is ADVISORY, not authoritative — it filters on
 *     permanent role only, so a clinic running the manager evaluator in
 *     `enforce` mode can still 403. The picker therefore stays mounted under
 *     the error banner so a different manager can be nominated immediately.
 *   - Log entries are freeform "note" category only; an equipment picker for
 *     "equipment" category entries is a future slice.
 */
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Crypto from "expo-crypto";

import { useIdentity } from "@/app/useIdentity";
import { api } from "@/lib/api";
import { codeBlueApi, codeBlueKeys } from "@/lib/api/code-blue";
import type {
  ActiveCodeBlueResponse,
  CodeBlueManager,
  CodeBlueSession,
  CodeBlueSessionOutcome,
} from "@/types/code-blue";

import {
  canEndCodeBlue,
  canInitiateCodeBlue,
  canSelfManageCodeBlue,
  codeBlueMutationErrorKey,
  computeElapsedMsForLog,
  resolveLogDraftIdempotencyKey,
  type CodeBlueMutationErrorKey,
  type LogDraftIdempotencyEntry,
} from "./code-blue-actions-derive";
import { useCodeBlueMutations } from "./useCodeBlueMutations";

const OUTCOMES: readonly CodeBlueSessionOutcome[] = ["rosc", "died", "transferred", "ongoing"];

type Mutations = ReturnType<typeof useCodeBlueMutations>;

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

/** Renders a mutation's error as an `ErrorBanner`, or nothing when it isn't errored. */
function MutationErrorBanner({
  mutation,
}: Readonly<{ mutation: Readonly<{ isError: boolean; error: unknown }> }>) {
  if (!mutation.isError) return null;
  return <ErrorBanner errorKey={codeBlueMutationErrorKey(mutation.error)} />;
}

/**
 * CodeRabbit PR #49: a FAILED `codeBlueKeys.active()` read must not collapse
 * to "no session" (which would offer Start and risk a double-start). Mirrors
 * `CodeBlueViewer`'s `LoadErrorState` copy/shape exactly.
 */
function QueryErrorState({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 px-5 pb-3" testID="code-blue-actions">
      <Text className="text-center font-rubik text-[13px] text-danger">{t("codeBlue.loadError")}</Text>
      <ActionButton label={t("common.retry")} onPress={onRetry} />
    </View>
  );
}

/** Manager-candidate list key — see `api.users.managers` for the advisory caveat. */
export const codeBlueManagerKeys = {
  all: ["users", "code-blue-managers"] as const,
};

/**
 * Nomination path for an initiator who cannot be their own manager
 * (senior_technician / technician). One tap per candidate: the row IS the
 * commit, so an arrest never costs a select-then-confirm round trip.
 *
 * The list stays mounted through a failed start — a 403
 * MANAGER_NOT_CODE_BLUE_ELIGIBLE (gate 3, per-clinic `enforce`) or a 400
 * INVALID_MANAGER (gate 2, candidate deactivated since the fetch) is a
 * "pick someone else" signal, not a dead end.
 */
function ManagerPicker({ start }: Readonly<{ start: Mutations["start"] }>) {
  const { t } = useTranslation();
  const managersQuery = useQuery({
    queryKey: codeBlueManagerKeys.all,
    queryFn: () => api.users.managers(),
  });

  if (managersQuery.isPending) {
    return (
      <Text className="text-center font-rubik text-[13px] text-text-tertiary">
        {t("codeBlue.actions.managersLoading")}
      </Text>
    );
  }
  if (managersQuery.isError) {
    return (
      <>
        <Text className="text-center font-rubik text-[13px] text-danger">
          {t("codeBlue.actions.managersLoadError")}
        </Text>
        <ActionButton label={t("common.retry")} onPress={() => void managersQuery.refetch()} />
      </>
    );
  }

  const managers: readonly CodeBlueManager[] = managersQuery.data ?? [];
  if (managers.length === 0) {
    return (
      <Text className="text-center font-rubik text-[13px] text-text-tertiary">
        {t("codeBlue.actions.managersEmpty")}
      </Text>
    );
  }

  return (
    <>
      <Text className="font-rubik-semibold text-[15px] text-text-primary">
        {t("codeBlue.actions.pickManager")}
      </Text>
      <Text className="font-rubik text-[13px] text-text-tertiary">
        {t("codeBlue.actions.pickManagerHint")}
      </Text>
      {managers.map((manager) => (
        <ActionButton
          key={manager.id}
          label={manager.name}
          testID={`code-blue-manager-${manager.id}`}
          disabled={start.isPending || !manager.name.trim()}
          onPress={() => {
            // Server `startSessionSchema` requires managerUserName.min(1) — a
            // nameless row would 400 on shape before reaching either gate.
            const managerUserName = manager.name.trim();
            if (!managerUserName) return;
            start.mutate({ managerUserId: manager.id, managerUserName });
          }}
        />
      ))}
    </>
  );
}

function StartAffordance({
  canSelfManage,
  canInitiate,
  managerUserName,
  currentUserId,
  start,
}: Readonly<{
  canSelfManage: boolean;
  canInitiate: boolean;
  managerUserName: string;
  currentUserId: string | null;
  start: Mutations["start"];
}>) {
  const { t } = useTranslation();
  if (canSelfManage) {
    return (
      <ActionButton
        label={start.isPending ? t("codeBlue.actions.starting") : t("codeBlue.actions.start")}
        disabled={start.isPending || !managerUserName}
        onPress={() => {
          if (!currentUserId || !managerUserName) return;
          start.mutate({ managerUserId: currentUserId, managerUserName });
        }}
      />
    );
  }
  if (canInitiate) return <ManagerPicker start={start} />;
  return (
    <Text className="text-center font-rubik text-[13px] text-text-tertiary">
      {t("codeBlue.actions.startNotEligible")}
    </Text>
  );
}

function NoSessionActions(
  props: Readonly<{
    canSelfManage: boolean;
    canInitiate: boolean;
    managerUserName: string;
    currentUserId: string | null;
    start: Mutations["start"];
  }>,
) {
  return (
    <View className="gap-2 px-5 pb-3" testID="code-blue-actions">
      <StartAffordance {...props} />
      <MutationErrorBanner mutation={props.start} />
    </View>
  );
}

/**
 * Log-entry draft form. CodeRabbit PR #49: the draft (note text) is cleared
 * ONLY in the mutation's own `onSuccess` — a failed/offline attempt leaves it
 * fully intact so the operator never loses an unsaved clinical entry. The
 * idempotency key is likewise stable across a retry of the SAME draft
 * (`resolveLogDraftIdempotencyKey` — mint once, reuse until the signature
 * changes or the draft is cleared by success), so a retry can never
 * double-post the same entry server-side.
 */
function LogEntryForm({
  sessionId,
  startedAt,
  addLogEntry,
}: Readonly<{ sessionId: string; startedAt: string; addLogEntry: Mutations["addLogEntry"] }>) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const idempotencyRef = useRef<LogDraftIdempotencyEntry | null>(null);
  const trimmedNote = note.trim();

  const onSubmit = () => {
    const entry = resolveLogDraftIdempotencyKey(idempotencyRef.current, trimmedNote, Crypto.randomUUID);
    idempotencyRef.current = entry;
    addLogEntry.mutate(
      {
        sessionId,
        payload: {
          idempotencyKey: entry.key,
          elapsedMs: computeElapsedMsForLog(startedAt, Date.now()),
          label: trimmedNote,
          category: "note",
        },
      },
      {
        onSuccess: () => {
          setNote("");
          idempotencyRef.current = null;
        },
      },
    );
  };

  return (
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
        label={addLogEntry.isPending ? t("codeBlue.actions.logging") : t("codeBlue.actions.addLog")}
        disabled={trimmedNote.length === 0 || addLogEntry.isPending}
        onPress={onSubmit}
      />
      <MutationErrorBanner mutation={addLogEntry} />
    </View>
  );
}

function OutcomePicker({
  outcome,
  onChoose,
}: Readonly<{ outcome: CodeBlueSessionOutcome; onChoose: (o: CodeBlueSessionOutcome) => void }>) {
  const { t } = useTranslation();
  return (
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
          onPress={() => onChoose(o)}
        >
          <Text className={`font-rubik-semibold text-[13px] ${outcome === o ? "text-white" : "text-foreground"}`}>
            {t(`codeBlue.outcome.${o}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function EndSessionControls({ sessionId, end }: Readonly<{ sessionId: string; end: Mutations["end"] }>) {
  const { t } = useTranslation();
  const [endOpen, setEndOpen] = useState(false);
  const [outcome, setOutcome] = useState<CodeBlueSessionOutcome>("rosc");

  return (
    <View className="gap-2">
      {endOpen ? (
        <View className="gap-2" testID="code-blue-end-outcome-picker">
          <OutcomePicker outcome={outcome} onChoose={setOutcome} />
          <ActionButton
            label={end.isPending ? t("codeBlue.actions.ending") : t("codeBlue.actions.confirmEnd")}
            disabled={end.isPending}
            onPress={() => end.mutate({ sessionId, payload: { outcome } })}
          />
        </View>
      ) : (
        <ActionButton
          label={t("codeBlue.actions.end")}
          disabled={end.isPending}
          onPress={() => setEndOpen(true)}
        />
      )}
      <MutationErrorBanner mutation={end} />
    </View>
  );
}

function ActiveSessionActions({
  session,
  isManager,
  mutations,
}: Readonly<{ session: CodeBlueSession; isManager: boolean; mutations: Mutations }>) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 px-5 pb-3" testID="code-blue-actions">
      <LogEntryForm sessionId={session.id} startedAt={session.startedAt} addLogEntry={mutations.addLogEntry} />

      <View className="gap-2">
        <ActionButton
          label={mutations.presence.isPending ? t("codeBlue.actions.joining") : t("codeBlue.actions.join")}
          disabled={mutations.presence.isPending}
          onPress={() => mutations.presence.mutate(session.id)}
        />
        {/* CodeRabbit PR #49 DOCTRINE fix: presence errors (incl. offline) were
            previously swallowed — render them the same loud way as every
            other mutation. */}
        <MutationErrorBanner mutation={mutations.presence} />
      </View>

      {isManager ? <EndSessionControls sessionId={session.id} end={mutations.end} /> : null}
    </View>
  );
}

/** Read-only body — assumes identity has already resolved (caller self-gates). */
export function CodeBlueActions() {
  const identity = useIdentity();
  const sessionQuery = useQuery({
    queryKey: codeBlueKeys.active(),
    queryFn: codeBlueApi.active,
  });
  const mutations = useCodeBlueMutations();

  // Identity + the (shared) session query must resolve before any action can
  // be gated correctly — CodeBlueViewer already renders its own loading state
  // for the latter, so this bar simply stays absent until both are ready.
  if (identity.isPending || sessionQuery.isPending) return null;

  // CodeRabbit PR #49: a FAILED/absent identity read is "unknown", never a
  // signed-in user — role-gated affordances would be misleading (e.g. showing
  // the vet-requirement to someone whose identity simply failed to load). The
  // broader auth recovery lives upstream in BootstrapGate; here the action bar
  // just stays absent until identity truly resolves.
  if (identity.isError || !identity.data) return null;

  // CodeRabbit PR #49: a FAILED read is "unknown", never "no session" — must
  // come before the `!session` branch so a transient error can't fall
  // through into offering Start.
  if (sessionQuery.isError) {
    return <QueryErrorState onRetry={() => void sessionQuery.refetch()} />;
  }

  const response: ActiveCodeBlueResponse | undefined = sessionQuery.data;
  const session = response?.session ?? null;
  const currentUserId = identity.data?.id ?? null;
  // PERMANENT role, deliberately NOT `effectiveRole` (which most other surfaces
  // in this app read): server gate 2 is `inArray(users.role, …)`, and gate 1's
  // break-glass (`allowPermanentClinicalRoleForEmergency`) admits a clinical
  // identity with no active shift. Reading `effectiveRole` here would
  // under-offer Start to exactly the off-shift responder break-glass exists for.
  const currentRole = identity.data?.role ?? null;

  if (!session) {
    // The server's startSessionSchema requires managerUserName.min(1) — never
    // fire Start with an empty name (would 400); the button simply stays
    // disabled rather than round-tripping a request that can't succeed.
    const managerUserName = (identity.data?.displayName ?? identity.data?.name ?? "").trim();
    return (
      <NoSessionActions
        canSelfManage={canSelfManageCodeBlue(currentRole)}
        canInitiate={canInitiateCodeBlue(currentRole)}
        managerUserName={managerUserName}
        currentUserId={currentUserId}
        start={mutations.start}
      />
    );
  }

  return (
    <ActiveSessionActions
      session={session}
      isManager={canEndCodeBlue(currentUserId, session.managerUserId)}
      mutations={mutations}
    />
  );
}
