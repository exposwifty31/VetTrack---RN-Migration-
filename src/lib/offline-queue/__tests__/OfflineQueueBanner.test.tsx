/**
 * W3a offline-queue failure UI: the banner turns the derived status into
 * user-facing, localized copy with a strict priority — a paused circuit outranks
 * a dropped write, which outranks a plain pending backlog; a clean queue renders
 * nothing at all.
 */
import { render, screen } from "@testing-library/react-native";

import i18next from "@/i18n/config";

import { INITIAL_OFFLINE_QUEUE_STATUS } from "../offline-queue-status";
import { OfflineQueueBannerView } from "../OfflineQueueBanner";

describe("OfflineQueueBannerView", () => {
  it("shows the paused copy while the circuit is open (outranks everything)", async () => {
    await render(
      <OfflineQueueBannerView
        status={{ pending: 2, circuitOpenUntil: 10_000, lastPermanentFailureAt: 4_000 }}
        now={5_000}
      />,
    );
    expect(screen.getByText(i18next.t("offlineQueue.paused"))).toBeTruthy();
    expect(screen.queryByText(i18next.t("offlineQueue.failed"))).toBeNull();
  });

  it("shows the failed copy when a write was dropped and the circuit is closed", async () => {
    await render(
      <OfflineQueueBannerView
        status={{ pending: 1, circuitOpenUntil: null, lastPermanentFailureAt: 4_000 }}
        now={5_000}
      />,
    );
    expect(screen.getByText(i18next.t("offlineQueue.failed"))).toBeTruthy();
  });

  it("shows the pending count when only queued writes remain", async () => {
    await render(
      <OfflineQueueBannerView
        status={{ pending: 3, circuitOpenUntil: null, lastPermanentFailureAt: null }}
        now={0}
      />,
    );
    expect(screen.getByText(i18next.t("offlineQueue.pending", { count: 3 }))).toBeTruthy();
  });

  it("renders nothing when the queue is clean", async () => {
    await render(<OfflineQueueBannerView status={INITIAL_OFFLINE_QUEUE_STATUS} now={0} />);
    expect(screen.toJSON()).toBeNull();
  });
});
