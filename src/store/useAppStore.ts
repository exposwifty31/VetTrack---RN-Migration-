import { create } from 'zustand';

/**
 * Client-state store (Zustand — the Anchor's mandated client-state layer; no React
 * Context for high-frequency state). Server state will live in TanStack Query (later slice).
 *
 * Slice 1 keeps this minimal but real: the NFC spike writes `nfcSupported` here and the
 * screen reads it, proving the global-state wiring end-to-end rather than shipping an empty stub.
 */
type AppState = {
  nfcSupported: boolean | null;
  setNfcSupported: (value: boolean | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  nfcSupported: null,
  setNfcSupported: (value) => set({ nfcSupported: value }),
}));
