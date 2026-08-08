/**
 * Pure dispense-payload derivations (G3 Slice 10) — extracted from the sheet so
 * the validation + idempotency-key stability are unit-testable without dragging
 * Reanimated / react-query into jest (the `equipment-row-status` precedent).
 *
 * Two guards mirror the server (`server/routes/containers.ts` dispenseSchema):
 *   - at least one line with quantity > 0 (an empty non-emergency body is a no-op;
 *     an empty emergency body is the SEPARATE standalone-open flow we don't drive)
 *   - `bypassReason` is REQUIRED when `isEmergency` (Zod `.refine`)
 */
import type { BypassReason, DispenseLineInput, DispenseRequest } from "@/types/containers";

export type DispenseValidation =
  | Readonly<{ ok: true; payload: DispenseRequest }>
  | Readonly<{ ok: false; reason: "NO_ITEMS" | "MISSING_BYPASS_REASON" }>;

export type DispenseInput = Readonly<{
  /** itemId → requested quantity. Zero / negative entries are dropped. */
  quantities: Readonly<Record<string, number>>;
  isEmergency: boolean;
  bypassReason: BypassReason | null;
}>;

/** Positive, integer quantities only, sorted by itemId for a stable signature.
 * The itemId sort uses `localeCompare` for a well-defined, deterministic order
 * (never the default coercion sort) so identical payloads always serialize to
 * the same signature — the retry-reuses-one-key idempotency guarantee. */
function toLines(quantities: Readonly<Record<string, number>>): DispenseLineInput[] {
  return Object.keys(quantities)
    .filter((itemId) => Number.isInteger(quantities[itemId]) && quantities[itemId] > 0)
    .sort((a, b) => a.localeCompare(b))
    .map((itemId) => ({ itemId, quantity: quantities[itemId] }));
}

/**
 * Build the validated dispense request, or an explicit failure reason. The
 * caller maps `NO_ITEMS` / `MISSING_BYPASS_REASON` to disabled-confirm affordances
 * (no network round-trip for a locally-knowable rejection).
 */
export function buildDispenseRequest(input: DispenseInput): DispenseValidation {
  const items = toLines(input.quantities);
  if (items.length === 0) return { ok: false, reason: "NO_ITEMS" };
  if (input.isEmergency && !input.bypassReason) {
    return { ok: false, reason: "MISSING_BYPASS_REASON" };
  }
  return {
    ok: true,
    payload: {
      items,
      isEmergency: input.isEmergency,
      ...(input.bypassReason ? { bypassReason: input.bypassReason } : {}),
    },
  };
}

/**
 * Stable signature of a dispense payload — identical payloads produce identical
 * strings (items are already itemId-sorted), so the sheet reuses ONE
 * `Idempotency-Key` across retries of the same attempt and mints a fresh one
 * only when the payload changes. This is what prevents a retry-after-timeout
 * from double-decrementing stock.
 */
export function dispensePayloadSignature(payload: DispenseRequest): string {
  return JSON.stringify({
    items: payload.items.map((line) => [line.itemId, line.quantity]),
    isEmergency: payload.isEmergency,
    bypassReason: payload.bypassReason ?? null,
  });
}

export type IdempotencyEntry = Readonly<{ key: string; signature: string }>;

/**
 * Return a STABLE idempotency entry for a payload signature: reuse the previous
 * key when the signature is unchanged (a retry of the identical attempt →
 * server replays its cached result, never a double-decrement), mint a fresh key
 * only when the payload actually changed. `mint` is called ONLY on a genuinely
 * new payload, which the test asserts.
 */
export function resolveStableIdempotencyKey(
  previous: IdempotencyEntry | null,
  signature: string,
  mint: () => string,
): IdempotencyEntry {
  if (previous?.signature === signature) return previous;
  return { key: mint(), signature };
}
