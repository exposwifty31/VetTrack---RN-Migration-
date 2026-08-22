/**
 * The single equipment source the alerts derivation reads from.
 *
 * Extracted from `AlertsScreen` when the top bar's alerts dropdown needed the
 * same rows. Two call sites fetching "the fleet" with their own key and limit
 * is how a dropdown ends up disagreeing with the page it links to — the Home
 * screen's own `fleetQuery` uses a smaller page limit for its cards, so reusing
 * THAT would have quietly shown a different alert set than the alerts page.
 * Sharing the key also means opening the dropdown warms the page's cache.
 */
import { api } from "@/lib/api";
import type { EquipmentRow } from "@/types/api";

/**
 * The alerts view derives over the whole fleet rather than a page: an alert
 * that exists on row 1001 is still an alert.
 */
const EQUIPMENT_FLEET_LIMIT = 1000;

export const ALERTS_EQUIPMENT_KEY = ["equipment", "alerts-source"] as const;

export async function fetchAlertEquipment(): Promise<EquipmentRow[]> {
  const res = await api.equipment.list({ limit: EQUIPMENT_FLEET_LIMIT });
  // Throw on a non-200 so React Query marks the query failed and the list shows
  // its honest error state with retry — never a misleading "All clear" over an
  // outage.
  if (res.status !== 200) {
    throw new Error(`EQUIPMENT_LIST_FAILED_${res.status}`);
  }
  return res.data.items;
}
