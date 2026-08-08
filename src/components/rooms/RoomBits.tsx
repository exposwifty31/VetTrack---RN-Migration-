/**
 * Small shared presentational pieces for the room surfaces — a labeled stat
 * pill and the "last swept" meta line — so RoomListRow and the RoomDetail
 * header render them identically. All opaque, static (no motion), Aurora
 * semantic tokens.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { formatDate } from "@/lib/datetime";
import { deriveRoomSweptState } from "./rooms-derive";

/**
 * First-strong bidi isolate (FSI…PDI) for a person name that may be Latin or
 * Hebrew — auto-detects direction, unlike `ltrIsolate` which force-embeds LTR
 * (right only for guaranteed-Latin ids/emails).
 */
export function fsiIsolate(value: string): string {
  return `⁨${value}⁩`;
}

/** A count + noun-label stat. Number forced LTR; label flows with layout. */
export function StatPill({
  count,
  label,
}: Readonly<{ count: number; label: string }>) {
  return (
    <View className="flex-row items-baseline gap-1">
      <Text
        className="font-rubik-bold text-[15px] text-foreground"
        style={{ writingDirection: "ltr" }}
      >
        {count}
      </Text>
      <Text className="font-rubik text-[12px] text-muted">{label}</Text>
    </View>
  );
}

/**
 * "Swept today · by X" / "Never swept" tertiary line. All-time (not
 * shift-scoped), matching the server derivation. `nowMs` anchors the relative
 * bucket; anything older than yesterday shows the absolute date.
 */
export function SweptMeta({
  lastSweptAt,
  lastSweptByName,
  nowMs,
}: Readonly<{ lastSweptAt: string | null; lastSweptByName: string | null; nowMs: number }>) {
  const { t } = useTranslation();
  const state = deriveRoomSweptState(lastSweptAt, nowMs);

  let text: string;
  if (state.kind === "never") {
    text = t("rooms.swept.never");
  } else if (state.kind === "today") {
    text = t("rooms.swept.today");
  } else if (state.kind === "yesterday") {
    text = t("rooms.swept.yesterday");
  } else {
    const date = formatDate(lastSweptAt);
    text = date ? t("rooms.swept.on", { date }) : t("rooms.swept.never");
  }

  const showBy = state.kind !== "never" && !!lastSweptByName;

  return (
    <Text className="font-rubik text-[12px] text-text-tertiary" numberOfLines={1}>
      {text}
      {showBy ? ` · ${t("rooms.swept.by", { name: fsiIsolate(lastSweptByName!) })}` : ""}
    </Text>
  );
}
