/**
 * Pure derivations for the equipment detail screen — own module (the
 * `equipment-row-status` precedent) so tests import them without dragging the
 * section components' Reanimated dependency into the jest environment.
 */
import type { Confidence, EquipmentWaitlistSnapshot } from "@vettrack/shared";

import type { ChipTone } from "@/components/ui/chip-tone";
import type { EquipmentDetail } from "@/types/api";

function parseMs(value: string | null | undefined): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export type CustodyView =
  | { kind: "available" }
  | {
      kind: "held";
      byMe: boolean;
      email: string | null;
      sinceMs: number | null;
      dueMs: number | null;
      overdue: boolean;
    };

/**
 * Custody card model. Follows the `equipmentRowStatus` semantics (anything but
 * `checked_out` renders available), adding the by-me discrimination the action
 * buttons need and the expected-return derivation: due = checkedOutAt +
 * expectedReturnMinutes, overdue iff now is STRICTLY past due. Unparseable
 * timestamps yield null fields — callers render nothing, never a fabricated claim.
 */
export function deriveCustody(
  detail: Pick<
    EquipmentDetail,
    "custodyState" | "checkedOutById" | "checkedOutByEmail" | "checkedOutAt" | "expectedReturnMinutes"
  >,
  currentUserId: string | null | undefined,
  nowMs: number,
): CustodyView {
  if (detail.custodyState !== "checked_out") return { kind: "available" };
  const sinceMs = parseMs(detail.checkedOutAt);
  const dueMs =
    sinceMs != null && detail.expectedReturnMinutes != null && detail.expectedReturnMinutes > 0
      ? sinceMs + detail.expectedReturnMinutes * 60_000
      : null;
  return {
    kind: "held",
    byMe: !!currentUserId && detail.checkedOutById === currentUserId,
    email: detail.checkedOutByEmail ?? null,
    sinceMs,
    dueMs,
    overdue: dueMs != null && nowMs > dueMs,
  };
}

/**
 * Equipment status → semantic chip tone. Danger tones (issue/critical) render
 * the solid danger fill — static, never animated. Unknown values degrade to
 * neutral instead of guessing a severity.
 */
export function statusTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case "ok":
      return "success";
    case "sterilized":
      return "info";
    case "maintenance":
    case "needs_attention":
    case "overdue":
      return "warning";
    case "issue":
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

/** readinessState → tone. `not_ready` is warning (operational, not an emergency). */
export function readinessTone(readinessState: string | null | undefined): ChipTone {
  switch (readinessState) {
    case "ready":
      return "success";
    case "not_ready":
      return "warning";
    default:
      return "neutral";
  }
}

/** usageState → tone. `emergency_use` is the one danger-family usage value. */
export function usageTone(usageState: string | null | undefined): ChipTone {
  switch (usageState) {
    case "available":
      return "success";
    case "in_use":
      return "info";
    case "staged":
      return "warning";
    case "emergency_use":
      return "danger";
    default:
      return "neutral";
  }
}

export type WaitlistView = {
  joined: boolean;
  position: number | null;
  queueSize: number;
  /** Non-null only while MY reservation window is open (myStatus "notified"). */
  reservedUntilMs: number | null;
};

/**
 * Waitlist card model. "Joined" = an ACTIVE membership (waiting | notified) —
 * fulfilled/cancelled/expired rows read as not joined so the CTA flips back to
 * join, mirroring the server's waiting-only queue accounting.
 */
export function deriveWaitlist(snapshot: EquipmentWaitlistSnapshot): WaitlistView {
  const joined = snapshot.myStatus === "waiting" || snapshot.myStatus === "notified";
  return {
    joined,
    position: joined ? snapshot.myPosition : null,
    queueSize: snapshot.queueSize,
    reservedUntilMs:
      snapshot.myStatus === "notified" ? parseMs(snapshot.reservationExpiresAt) : null,
  };
}

/**
 * Copilot claim confidence → tone. Stale freshness dominates (the claim may be
 * strong but old); otherwise strength maps high→success, medium→info, low→warning.
 */
export function confidenceTone(confidence: Confidence): ChipTone {
  if (confidence.evidenceFreshness === "stale") return "stale";
  switch (confidence.evidenceStrength) {
    case "high":
      return "success";
    case "medium":
      return "info";
    case "low":
      return "warning";
    default:
      return "neutral";
  }
}
