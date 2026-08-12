import type { PushData } from "@/core/ports/push.port";

/** A navigation intent derived from a notification tap. Navigation only — no state. */
export type PushNavTarget = { screen: "Emergency" } | { screen: "Main" };

/**
 * Decide where a notification tap navigates, from the server-provided `data` bag.
 *
 * ADR-009 (binding): ALERT + DEEP-LINK only. This is a PURE function of the payload
 * — it never reads or writes Code Blue / emergency state, never touches the query
 * cache. An emergency / code-blue notification routes to the Emergency screen;
 * everything else lands on the app root (a tap should never dead-end).
 */
export function resolvePushNavTarget(data: PushData): PushNavTarget {
  const type = typeof data?.type === "string" ? data.type.toLowerCase() : "";
  const url = typeof data?.url === "string" ? data.url.toLowerCase() : "";
  const isEmergency =
    type.includes("code_blue") ||
    type.includes("code-blue") ||
    type.includes("emergency") ||
    url.includes("code-blue") ||
    url.includes("emergency");
  return isEmergency ? { screen: "Emergency" } : { screen: "Main" };
}
