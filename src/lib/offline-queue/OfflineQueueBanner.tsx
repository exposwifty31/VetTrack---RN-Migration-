import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type OfflineQueueStatus, useOfflineQueueStatus } from "./offline-queue-status";

/**
 * W3a offline-queue failure UI — the surface the queue never had.
 *
 * Priority (highest first): a paused replay circuit outranks a dropped write,
 * which outranks a plain pending backlog. A clean queue renders nothing.
 *
 * Pure + prop-driven so it is trivially testable; the container below feeds it
 * live status + the safe-area top inset.
 */
export function OfflineQueueBannerView({
  status,
  now,
  topInset = 0,
}: {
  status: OfflineQueueStatus;
  now: number;
  topInset?: number;
}) {
  const { t } = useTranslation();

  const circuitActive = status.circuitOpenUntil != null && status.circuitOpenUntil > now;

  let message: string | null = null;
  let danger = false;
  if (circuitActive) {
    message = t("offlineQueue.paused");
  } else if (status.lastPermanentFailureAt != null) {
    message = t("offlineQueue.failed");
    danger = true;
  } else if (status.pending > 0) {
    message = t("offlineQueue.pending", { count: status.pending });
  }

  if (!message) return null;

  return (
    <View
      testID="offline-queue-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ paddingTop: topInset }}
      className="mx-4 mt-2 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <Text className={danger ? "text-[14px] text-danger" : "text-[14px] text-foreground"}>
        {message}
      </Text>
    </View>
  );
}

/** App-mounted container: subscribes to live queue status and safe-area insets. */
export function OfflineQueueBanner() {
  const status = useOfflineQueueStatus();
  const insets = useSafeAreaInsets();
  // `now` starts at 0 (any open circuit deadline > 0 reads as active) and is
  // advanced only from the timer callback below — never synchronously in render
  // or an effect body, which the React-compiler lint rules forbid.
  const [now, setNow] = useState(0);

  // While a circuit is open, advance `now` past its cooldown so the paused banner
  // clears itself even if no further queue event arrives.
  useEffect(() => {
    if (status.circuitOpenUntil == null) return;
    const remaining = status.circuitOpenUntil - Date.now();
    const id = setTimeout(() => setNow(Date.now()), remaining > 0 ? remaining + 50 : 0);
    return () => clearTimeout(id);
  }, [status.circuitOpenUntil]);

  return <OfflineQueueBannerView status={status} now={now} topInset={insets.top} />;
}
