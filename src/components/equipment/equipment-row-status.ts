/**
 * Pure derivations for the Aurora equipment row — their own module so tests
 * import them without dragging the component's Reanimated dependency into the
 * jest environment.
 */
import { DAY_MS, EXCEPTION_STALE_DAYS } from "@/lib/home-readiness";
import type { EquipmentRow as EquipmentRowType } from "@/types/api";

export type EquipmentRowStatus =
  | { kind: "held_by"; email: string }
  | { kind: "held" }
  | { kind: "available" };

export function equipmentRowStatus(
  item: Pick<EquipmentRowType, "custodyState" | "checkedOutByEmail">,
): EquipmentRowStatus {
  if (item.custodyState !== "checked_out") return { kind: "available" };
  if (item.checkedOutByEmail) return { kind: "held_by", email: item.checkedOutByEmail };
  return { kind: "held" };
}

export type EquipmentRowMeta =
  | { kind: "never_seen" }
  | { kind: "seen"; days: number; stale: boolean };

/**
 * Third (metadata) tier — coarse "updated X days ago" from `lastSeen`, sharing
 * the home exceptions semantics exactly: stale iff the last scan is STRICTLY
 * more than `EXCEPTION_STALE_DAYS` ago (`deriveExceptions` boundary), and a
 * `lastSeen: null` unit is "טרם נסרק" — honest, never stale-colored (the
 * exceptions derivation does not count it either). An unparseable timestamp
 * returns null → the row renders no meta line rather than a fabricated claim.
 */
export function equipmentRowMeta(
  lastSeen: string | null | undefined,
  nowMs: number,
): EquipmentRowMeta | null {
  if (lastSeen == null) return { kind: "never_seen" };
  const seenMs = Date.parse(lastSeen);
  if (!Number.isFinite(seenMs)) return null;
  const ageMs = Math.max(0, nowMs - seenMs);
  return {
    kind: "seen",
    days: Math.floor(ageMs / DAY_MS),
    stale: ageMs > EXCEPTION_STALE_DAYS * DAY_MS,
  };
}
