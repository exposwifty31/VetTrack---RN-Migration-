/**
 * One-shot hand-off for the scan→dispense deep-link (G3 Slice 10). The
 * `Inventory` route is param-free (navigation is frozen this wave — no new
 * routes/params), so a scanned container is stashed here and consumed ONCE by
 * `InventoryScreen` at mount (a lazy `useState` initializer — never a setState
 * effect, which the repo lint rule forbids). Mirrors EquipmentList's
 * "seeds state at mount" doctrine for a param-free target.
 *
 * Deliberately a tiny module ref, not a store: it is a transient navigation
 * hand-off, never a second source of truth for the selected container.
 */
export type PendingContainer = Readonly<{ id: string; name: string }>;

let pending: PendingContainer | null = null;

export function setPendingDispenseContainer(container: PendingContainer | null): void {
  pending = container;
}

/** Read-and-clear. Returns the stashed container exactly once, then null. */
export function consumePendingDispenseContainer(): PendingContainer | null {
  const value = pending;
  pending = null;
  return value;
}
