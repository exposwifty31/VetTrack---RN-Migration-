/**
 * W3a wiring proof: the mounted <OfflineQueueBanner/> container is actually
 * driven by the live queue — enqueuing a real offline write after mount makes
 * the banner appear. This is the "reachable, not just present" bar: the status
 * store subscribes to `subscribeOfflineQueueEvent` and re-renders on real events.
 */
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";

import i18next from "@/i18n/config";

import {
  _resetOfflineQueueForTests,
  enqueueOfflineWrite,
  getOfflineQueueSnapshot,
} from "../offline-queue";
import { _resetOfflineQueueStatusForTests } from "../offline-queue-status";
import { OfflineQueueBanner } from "../OfflineQueueBanner";

// Zero insets so children render synchronously in jest (the real provider gates
// children on async layout measurement).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

// In-memory persistence for the queue store (mirrors offline-queue.test.ts).
const mockMemoryStore = new Map<string, string>();
jest.mock("@/lib/safe-storage", () => ({
  safeStorageGetItem: (key: string) => mockMemoryStore.get(key) ?? null,
  safeStorageSetItem: (key: string, value: string) => {
    mockMemoryStore.set(key, value);
  },
  safeStorageRemoveItem: (key: string) => mockMemoryStore.delete(key),
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

beforeEach(() => {
  mockMemoryStore.clear();
  _resetOfflineQueueForTests();
  _resetOfflineQueueStatusForTests();
});

async function mountBanner() {
  await render(
    <I18nextProvider i18n={i18next}>
      <OfflineQueueBanner />
    </I18nextProvider>,
  );
}

describe("OfflineQueueBanner (wired)", () => {
  it("renders nothing on a clean queue, then surfaces a write enqueued after mount", async () => {
    await mountBanner();
    expect(screen.queryByTestId("offline-queue-banner")).toBeNull();

    act(() => {
      enqueueOfflineWrite({
        endpoint: "/api/equipment/eq-1/checkout",
        method: "POST",
        body: "{}",
        userId: "u1",
      });
    });

    expect(getOfflineQueueSnapshot()).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByTestId("offline-queue-banner")).toBeTruthy();
    });
    expect(screen.getByText(i18next.t("offlineQueue.pending", { count: 1 }))).toBeTruthy();
  });
});
