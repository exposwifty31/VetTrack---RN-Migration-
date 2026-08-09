/**
 * TwoPane — the Slice-13 master/detail frame for the tablet (iPad) layout.
 *
 * Purely presentational: it owns geometry only. Selection state, data and
 * navigation stay on the screen that composes it, so the same frame serves
 * Equipment, Rooms and Tasks without knowing any of their domains.
 *
 * Doctrine:
 *   - Aurora: ZERO blur layers. The frame is transparent over the screen's own
 *     `AuroraBackground`; panes render the screens' existing opaque surfaces.
 *   - ZERO animation on pane swap — a pane change is instant (frozen motion
 *     doctrine). Press feedback stays where it already lives (`PressableScale`).
 *   - Each pane owns its own scroll, so the master list keeps its position while
 *     the detail pane scrolls independently.
 *   - RTL: logical `end` props only. `flexDirection: "row"` is ALREADY flipped by
 *     RN's `I18nManager` when `isRTL`, so the master lands on the right in
 *     Hebrew for free — adding `row-reverse` here would double-flip it back.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useUniwind } from "uniwind";

import { SearchIcon } from "@/components/home/icons";
import { ListEmptyState } from "@/components/ui/ListEmptyState";

import { MASTER_MAX_WIDTH, resolveMasterWidth } from "./two-pane-layout";

type TwoPaneProps = Readonly<{
  /** The list pane. Owns its own scroll. */
  master: ReactNode;
  /** The detail pane; `null` when nothing is selected. */
  detail: ReactNode | null;
  /** Rendered in the detail pane while `detail` is null. */
  placeholder?: ReactNode;
  /** Upper bound for the master pane width (default 380). */
  masterWidth?: number;
  /** Accessibility label for the master pane region. */
  masterLabel: string;
  /** Accessibility label for the detail pane region. */
  detailLabel: string;
}>;

export function TwoPane({
  master,
  detail,
  placeholder,
  masterWidth = MASTER_MAX_WIDTH,
  masterLabel,
  detailLabel,
}: TwoPaneProps) {
  const { width } = useWindowDimensions();
  const paneWidth = resolveMasterWidth(width, masterWidth);

  return (
    // minHeight 0 lets each pane's scroller shrink inside the row instead of
    // growing the frame past the screen.
    <View className="flex-1 flex-row" style={{ minHeight: 0 }}>
      <View
        accessibilityRole="none"
        accessibilityLabel={masterLabel}
        className="border-border"
        style={{ width: paneWidth, flexShrink: 0, borderEndWidth: StyleSheet.hairlineWidth }}
      >
        {master}
      </View>
      <View
        accessibilityRole="none"
        accessibilityLabel={detailLabel}
        className="flex-1"
        style={{ minHeight: 0 }}
      >
        {detail ?? placeholder ?? null}
      </View>
    </View>
  );
}

/**
 * Empty detail pane — a muted centred icon over the shared honest empty state.
 * Copy comes from the caller (i18n key) so this stays namespace-free.
 */
export function SelectPlaceholder({ title, body }: Readonly<{ title: string; body?: string }>) {
  const { theme } = useUniwind();
  return (
    <View className="flex-1 items-center justify-center">
      <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
        <SearchIcon color={theme === "light" ? "#5B5680" : "#A6A0C3"} size={22} />
      </View>
      <ListEmptyState title={title} body={body} />
    </View>
  );
}
