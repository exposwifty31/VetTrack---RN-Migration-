/**
 * Code Blue derivation — server response -> view state for the G4-1 read-only
 * viewer. Pure + framework-free (the `alerts-derive` precedent): no i18n, no
 * RN, no `Date.now()` — `nowMs` is threaded so fixtures stay deterministic.
 */
import type { ActiveCodeBlueResponse } from "@/types/code-blue";

export type CodeBlueLogEntryView = Readonly<{
  id: string;
  elapsedMs: number;
  label: string;
  category: "equipment" | "note";
  loggedByName: string;
}>;

export type CodeBluePresenceView = Readonly<{
  userId: string;
  userName: string;
}>;

export type CodeBlueCartStatusView = Readonly<{
  allPassed: boolean;
  performedByName: string;
  lastCheckedAt: string;
}>;

export type CodeBlueViewState =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "active";
      sessionId: string;
      managerUserName: string;
      startedByName: string;
      startedAt: string;
      /** `max(0, nowMs - startedAt)` — never negative even under clock skew. */
      elapsedMs: number;
      logEntries: readonly CodeBlueLogEntryView[];
      presence: readonly CodeBluePresenceView[];
      cartStatus: CodeBlueCartStatusView | null;
    }>;

/** MM:SS under an hour, H:MM:SS at or beyond — matches the resuscitation-timer idiom. */
export function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function deriveCodeBlueView(
  response: ActiveCodeBlueResponse,
  nowMs: number,
): CodeBlueViewState {
  const { session } = response;
  if (!session) return { kind: "none" };

  const startedAtMs = Date.parse(session.startedAt);
  const elapsedMs = Number.isFinite(startedAtMs) ? Math.max(0, nowMs - startedAtMs) : 0;

  const logEntries = [...response.logEntries]
    .sort((a, b) => a.elapsedMs - b.elapsedMs)
    .map(
      (entry): CodeBlueLogEntryView => ({
        id: entry.id,
        elapsedMs: entry.elapsedMs,
        label: entry.label,
        category: entry.category,
        loggedByName: entry.loggedByName,
      }),
    );

  const presence = response.presence.map(
    (p): CodeBluePresenceView => ({ userId: p.userId, userName: p.userName }),
  );

  const cartStatus: CodeBlueCartStatusView | null = response.cartStatus
    ? {
        allPassed: response.cartStatus.allPassed,
        performedByName: response.cartStatus.performedByName,
        lastCheckedAt: response.cartStatus.lastCheckedAt,
      }
    : null;

  return {
    kind: "active",
    sessionId: session.id,
    managerUserName: session.managerUserName,
    startedByName: session.startedByName,
    startedAt: session.startedAt,
    elapsedMs,
    logEntries,
    presence,
    cartStatus,
  };
}
