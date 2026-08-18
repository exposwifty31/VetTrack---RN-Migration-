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
 *   - Start is gated on the TWO unconditional server gates SEPARATELY, because
 *     they read different fields (see the block comment in
 *     `code-blue-actions-derive.ts`): gate 1 on the shift-derived role, gate 2
 *     on the permanent one. Clearing both — a vet, or an admin holding a
 *     clinical shift — is a one-tap self-designation. Clearing only gate 1
 *     (a senior_technician/technician) means NOMINATING a vet/admin from
 *     GET /api/users/managers. Clearing neither shows the explanation and no
 *     affordance.
 *   - The candidate list is ADVISORY, not authoritative — it filters on
 *     permanent role only, so a clinic running the manager evaluator in
 *     `enforce` mode can still 403. The picker therefore stays mounted under
 *     the error banner so a different manager can be nominated immediately.
 *   - Log entries are freeform "note" category only; an equipment picker for
 *     "equipment" category entries is a future slice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  type LogDraftIdempotencyEntry,
} from "./code-blue-actions-derive";
import {
  oneTapStartErrorKey,
  resolveOneTapStartToken,
  type OneTapStartErrorKey,
} from "./one-tap-derive";
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

function ErrorBanner({ errorKey }: Readonly<{ errorKey: OneTapStartErrorKey }>) {
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

/**
 * Renders a mutation's error as an `ErrorBanner`, or nothing when it isn't
 * errored. `mapError` defaults to the shared mapper; the START action passes
 * `oneTapStartErrorKey` so the one-tap-only codes (the three distinct 409
 * `CODE_BLUE_START_CONFLICT` reasons, `INVALID_MANAGER`) get their own copy
 * instead of collapsing into the generic banner.
 */
function MutationErrorBanner({
  mutation,
  mapError = codeBlueMutationErrorKey,
}: Readonly<{
  mutation: Readonly<{ isError: boolean; error: unknown }>;
  mapError?: (error: unknown) => OneTapStartErrorKey;
}>) {
  if (!mutation.isError) return null;
  return <ErrorBanner errorKey={mapError(mutation.error)} />;
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

/**
 * Manager-candidate list key — see `api.users.managers` for the advisory caveat.
 *
 * Shares the `"users"` root with `IDENTITY_QUERY_KEY` (`["users","me"]`). Benign
 * today, but a future root-prefixed `invalidateQueries(["users"])` — or a
 * persister, of which this app has NONE (verified in `lib/api/code-blue.ts`'s
 * header) — would sweep both. If persistence ever lands, this key stays OUT of
 * the include-list for the same reason `codeBlueKeys.active()` does.
 */
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
/** Dispatch a Code Blue start. Supplied by {@link NoSessionActions}, which owns
 *  the idempotency token — no call site mints or forwards one itself. */
type StartCodeBlue = (managerUserId: string, managerUserName: string) => void;

function ManagerPicker({
  start,
  onStart,
}: Readonly<{ start: Mutations["start"]; onStart: StartCodeBlue }>) {
  const { t } = useTranslation();
  // Deliberately inherits `createAppQueryClient` defaults (`retry: 1`,
  // `staleTime: 5_000` — src/lib/query-client.ts), NOT react-query's own
  // `retry: 3` + backoff: on an arrest path a failed fetch must reach the
  // error state fast, and a 5s staleTime keeps the roster fresh per arrest.
  // Do not raise either here.
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
      {/* Nomination is SILENT by owner decision — the person picked is never
          told. They are also the ONLY identity the server will accept to end
          the session (403 MANAGER_ONLY). With no notify step to carry that
          later, the consequence has to be legible here, at the moment of
          choosing. */}
      <Text
        testID="code-blue-manager-consequence"
        className="font-rubik-semibold text-[13px] text-danger"
      >
        {t("codeBlue.actions.pickManagerConsequence")}
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
            onStart(manager.id, managerUserName);
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
  onStart,
}: Readonly<{
  canSelfManage: boolean;
  canInitiate: boolean;
  managerUserName: string;
  currentUserId: string | null;
  start: Mutations["start"];
  onStart: StartCodeBlue;
}>) {
  const { t } = useTranslation();
  // BOTH gates, not gate 2 alone: `canSelfManage` is the permanent role
  // (gate 2's `users.role`) and `canInitiate` is the shift-derived one
  // (gate 1). A vet rostered onto an admin shift satisfies gate 2 and fails
  // gate 1 — offering them the one-tap Start would be a guaranteed 403.
  if (canInitiate && canSelfManage) {
    return (
      <ActionButton
        label={start.isPending ? t("codeBlue.actions.starting") : t("codeBlue.actions.start")}
        disabled={start.isPending || !managerUserName}
        onPress={() => {
          if (!currentUserId || !managerUserName) return;
          onStart(currentUserId, managerUserName);
        }}
      />
    );
  }
  if (canInitiate) return <ManagerPicker start={start} onStart={onStart} />;
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
  const { start } = props;

  /**
   * J1 — the idempotency fence. ONE token per start GESTURE, minted on the
   * first press and re-sent verbatim on every retry of that gesture: the
   * server keys its durable `vt_code_blue_start_claims` row on it, so a
   * double-press or a retry after a lost response REPLAYS the original session
   * instead of racing a second start.
   */
  const tokenRef = useRef<string | null>(null);

  /**
   * RECONCILE (J1 x manager-picker): the ONLY place a start is dispatched.
   *
   * The two slices landed in parallel. J1 moved `start` onto
   * POST /api/code-blue/one-tap, where `idempotencyToken` is REQUIRED
   * (`oneTapStartSchema`, `.strict()`), and minted the token at its single
   * call site. The picker slice meanwhile split that site in two — self-manage
   * and nominate-a-manager. Each branch was green alone; together, both picker
   * call sites would have posted without a token and 400'd, including the
   * nominate path that is the whole point of the picker.
   *
   * Passing one callback down rather than patching two `start.mutate` calls is
   * deliberate: a call site that cannot see `start` cannot forget the token.
   * Same shape as the emergency-push fix — remove the branch, don't remember it.
   */
  const startCodeBlue = useCallback(
    (managerUserId: string, managerUserName: string) => {
      if (!managerUserId || !managerUserName) return;
      const idempotencyToken = resolveOneTapStartToken(tokenRef.current, Crypto.randomUUID);
      tokenRef.current = idempotencyToken;
      start.mutate(
        { idempotencyToken, managerUserId, managerUserName },
        {
          onSuccess: () => {
            tokenRef.current = null;
          },
        },
      );
    },
    [start],
  );

  return (
    <View className="gap-2 px-5 pb-3" testID="code-blue-actions">
      <StartAffordance {...props} onStart={startCodeBlue} />
      <MutationErrorBanner mutation={props.start} mapError={oneTapStartErrorKey} />
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

  /**
   * A failed start must not haunt the NEXT arrest.
   *
   * `useCodeBlueMutations` lives here, in a component that stays mounted across
   * session transitions, while the start banner lives in `NoSessionActions`,
   * which mounts only while there is no active session. react-query holds
   * `isError` until the mutation is reset or re-fired, so a 409 raised during
   * one arrest is still set when `NoSessionActions` remounts after that session
   * ends — telling the next responder "a Code Blue already exists" when none
   * does, at the moment that costs most.
   *
   * Keyed on the session IDENTITY, deliberately not on every render: an error
   * raised while the screen is still session-less has to survive long enough to
   * be read. Only a session appearing or ending clears it.
   */
  const activeSessionId = sessionQuery.data?.session?.id ?? null;
  const resetStart = mutations.start.reset;
  useEffect(() => {
    resetStart();
  }, [activeSessionId, resetStart]);

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
  // The two gates read DIFFERENT fields, so both are threaded (see the block
  // comment in `code-blue-actions-derive.ts`):
  //   gate 1 (initiate) — the SHIFT-derived role, falling back to permanent
  //     when no shift resolved. `vt_shift_role` has no "vet" member, so an
  //     on-shift vet's effective role is a technician grade; and an admin on a
  //     clinical shift genuinely gains clinical authority server-side.
  //   gate 2 (self-manage) — `users.role`, the permanent one, unconditionally.
  const permanentRole = identity.data?.role ?? null;
  const effectiveRole = identity.data?.effectiveRole ?? null;

  if (!session) {
    // The server's startSessionSchema requires managerUserName.min(1) — never
    // fire Start with an empty name (would 400); the button simply stays
    // disabled rather than round-tripping a request that can't succeed.
    const managerUserName = (identity.data?.displayName ?? identity.data?.name ?? "").trim();
    return (
      <NoSessionActions
        canSelfManage={canSelfManageCodeBlue(permanentRole)}
        canInitiate={canInitiateCodeBlue(effectiveRole, permanentRole)}
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
