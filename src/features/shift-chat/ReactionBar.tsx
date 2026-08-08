/**
 * The three-emoji reaction bar (fixed server enum 👍 / ✅ / 👀). Each emoji is a
 * PressableScale toggle showing its count; the caller's own reaction is
 * highlighted with the accent border. Opaque surfaces, press-scale feedback
 * only — no content animation.
 */
import { Text, View } from "react-native";

import { PressableScale } from "@/components/PressableScale";
import { REACTION_EMOJIS, type ReactionEmoji, type ShiftMessageReaction } from "@/lib/api/shift-chat";

type ReactionBarProps = Readonly<{
  reactions: readonly ShiftMessageReaction[];
  meUserId: string | null;
  onToggle: (emoji: ReactionEmoji) => void;
}>;

function countFor(reactions: readonly ShiftMessageReaction[], emoji: ReactionEmoji): number {
  let n = 0;
  for (const r of reactions) if (r.emoji === emoji) n += 1;
  return n;
}

function mineFor(
  reactions: readonly ShiftMessageReaction[],
  emoji: ReactionEmoji,
  meUserId: string | null,
): boolean {
  if (!meUserId) return false;
  return reactions.some((r) => r.emoji === emoji && r.userId === meUserId);
}

export function ReactionBar({ reactions, meUserId, onToggle }: ReactionBarProps) {
  return (
    <View className="mt-1.5 flex-row gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const count = countFor(reactions, emoji);
        const mine = mineFor(reactions, emoji, meUserId);
        return (
          <PressableScale
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={emoji}
            accessibilityState={{ selected: mine }}
            className={`min-h-[28px] flex-row items-center gap-1 rounded-full border px-2.5 py-1 ${
              mine ? "border-accent bg-surface-raised" : "border-border bg-surface"
            }`}
            onPress={() => onToggle(emoji)}
          >
            <Text className="text-[13px]">{emoji}</Text>
            {count > 0 ? (
              <Text
                className={`font-rubik-semibold text-[12px] ${mine ? "text-accent" : "text-muted"}`}
                style={{ writingDirection: "ltr" }}
              >
                {count}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}
