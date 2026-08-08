/**
 * Scan→dispense hand-off for the deep-link (G3 Slice 10). The `Inventory` route
 * is param-free (navigation is frozen this wave — no new routes/params), so a
 * scanned container is stashed in a tiny reactive Zustand store and consumed
 * ONCE by `InventoryScreen`.
 *
 * Why a store, not a module ref: `navigation.navigate("Inventory")` returns to
 * the RETAINED route when it already sits below `Scan`, so a mount-only read
 * (lazy `useState` init) never re-runs and the sheet never opens. Backed by
 * Zustand, `InventoryScreen` re-consumes on every focus (see `useFocusEffect`
 * there), so a scan while Inventory is already mounted still opens the sheet.
 * The store is the repo's mandated client-state layer (Zustand — no Context for
 * navigation hand-off); `consume` is a read-and-clear so it stays one-shot.
 */
import { create } from "zustand";

export type PendingContainer = Readonly<{ id: string; name: string }>;

type PendingContainerStore = {
  pending: PendingContainer | null;
  setPending: (container: PendingContainer | null) => void;
  /** Atomic read-and-clear: returns the stashed container exactly once, then null. */
  consume: () => PendingContainer | null;
};

export const usePendingContainerStore = create<PendingContainerStore>((set, get) => ({
  pending: null,
  setPending: (container) => set({ pending: container }),
  consume: () => {
    const value = get().pending;
    if (value !== null) set({ pending: null });
    return value;
  },
}));

/** Imperative writer for non-React callers (ScanScreen's async scan handler). */
export function setPendingDispenseContainer(container: PendingContainer | null): void {
  usePendingContainerStore.getState().setPending(container);
}

/** Imperative read-and-clear (consumed by InventoryScreen on focus). */
export function consumePendingDispenseContainer(): PendingContainer | null {
  return usePendingContainerStore.getState().consume();
}
