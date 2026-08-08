/**
 * Restock session commit (G3 Slice 10). Commits each touched line's absolute
 * observed count to the session, then finishes (the sole server commit point).
 *
 * The commit is multi-step and NOT atomic: scans persist to the open session one
 * by one, and `finish` finalizes them. A mid-loop failure therefore leaves a
 * PARTIAL commit — earlier scans are recorded server-side but the session is not
 * finalized. So a failure must be reported precisely rather than as an
 * all-or-nothing "scan failed": the caller re-reads the session and picks the
 * message from `restockCommitErrorKey` so the user knows which step failed and
 * whether counts were already saved. Extracted from `RestockSheet` so the
 * step-distinguishing branch is unit-tested in isolation (and the sheet's
 * cognitive complexity stays under the SonarCloud gate).
 */
import type { ContainerInventoryLine } from "@/types/containers";

export type RestockErrorKey = "restock.error" | "restock.scanError" | "restock.partialError";

type CommitPhase = "scan" | "finish";

/** Structured commit failure carrying WHICH step failed and how many scans landed. */
export class RestockCommitError extends Error {
  readonly phase: CommitPhase;
  readonly committedCount: number;

  constructor(phase: CommitPhase, committedCount: number, options?: { cause?: unknown }) {
    super(`restock ${phase} failed`, options);
    this.name = "RestockCommitError";
    this.phase = phase;
    this.committedCount = committedCount;
  }
}

/** The session API surface this commit needs (scan a line, finalize the session). */
export type RestockCommitApi = Readonly<{
  scan: (sessionId: string, itemId: string, observed: number) => Promise<unknown>;
  finish: (sessionId: string) => Promise<unknown>;
}>;

/**
 * Commit each touched line, then finish. A line is skipped when untouched, or
 * when its edit already equals the server's held count — so a retry never
 * re-scans unchanged rows (`observedQuantity` is absolute, making re-scan safe).
 * On failure throws a `RestockCommitError` tagged with the phase + committed
 * count so the caller can distinguish scan / partial / finish failures.
 */
export async function commitRestockCounts(
  api: RestockCommitApi,
  sessionId: string,
  lines: readonly ContainerInventoryLine[],
  counts: Record<string, number>,
): Promise<void> {
  let committed = 0;
  for (const line of lines) {
    const itemId = line.itemId as string;
    const observed = counts[itemId];
    if (observed === undefined) continue;
    if (observed === (line.sessionObservedQuantity ?? line.actual)) continue;
    try {
      await api.scan(sessionId, itemId, observed);
    } catch (cause) {
      throw new RestockCommitError("scan", committed, { cause });
    }
    committed += 1;
  }
  try {
    await api.finish(sessionId);
  } catch (cause) {
    throw new RestockCommitError("finish", committed, { cause });
  }
}

/**
 * Map a commit failure to a translated message key, distinguishing which step
 * failed and whether counts were already saved:
 *   - a `finish` failure, or a `scan` failure after ≥1 scan landed → PARTIAL
 *     (counts saved, session not finalized — reopen to review);
 *   - the first scan failing (nothing saved) → a plain scan error;
 *   - anything else (non-commit error) → the generic error.
 */
export function restockCommitErrorKey(error: unknown): RestockErrorKey {
  if (error instanceof RestockCommitError) {
    if (error.phase === "finish" || error.committedCount > 0) return "restock.partialError";
    return "restock.scanError";
  }
  return "restock.error";
}
