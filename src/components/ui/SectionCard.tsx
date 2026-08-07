/**
 * Opaque Aurora card — `--color-surface` + hairline border + radius-md. Rows
 * and content cards never sit on glass (direction-1c-aurora.md); glass tiers
 * belong to BottomSheet/top-bar surfaces only.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

type SectionCardProps = Readonly<{
  children: ReactNode;
  /**
   * Appended after the base recipe. Uniwind does not deduplicate conflicting
   * utilities — pass additive classes (margins, gap), not overrides.
   */
  className?: string;
}>;

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <View
      className={`rounded-md border border-border bg-surface p-4${className ? ` ${className}` : ""}`}
    >
      {children}
    </View>
  );
}
