/**
 * Pure status-line derivation for the Aurora equipment row — its own module so
 * tests import it without dragging the component's Reanimated dependency into
 * the jest environment.
 */
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
