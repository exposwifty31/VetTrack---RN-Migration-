/**
 * Row selection for the top bar's alerts dropdown, kept pure so the cap and the
 * ordering are testable without mounting a popover.
 *
 * `deriveAlertsView` has already done the hard part: alerts are sorted
 * worst-first and split into urgent / maintenance sections. This flattens in
 * SECTION order so urgent rows stay ahead of maintenance ones, then caps. It
 * deliberately does not re-sort — a second sort here could disagree with the
 * full alerts page, and the dropdown is meant to be the head of that same list.
 */
import type { AlertsView, AlertViewRow } from "@/lib/alerts-derive";

/** The dropdown is a peek, not a second alerts page. */
export const DROPDOWN_ALERT_LIMIT = 5;

export function selectDropdownAlerts(
  view: AlertsView,
  limit: number = DROPDOWN_ALERT_LIMIT,
): AlertViewRow[] {
  const flat: AlertViewRow[] = [];
  for (const section of view.sections) {
    for (const row of section.rows) {
      if (flat.length >= limit) return flat;
      flat.push(row);
    }
  }
  return flat;
}
