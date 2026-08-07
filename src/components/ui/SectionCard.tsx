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

const BASE_CLASSES = "rounded-md border border-border bg-surface p-4";

export function SectionCard({ children, className }: SectionCardProps) {
  const resolvedClassName = className ? `${BASE_CLASSES} ${className}` : BASE_CLASSES;
  return <View className={resolvedClassName}>{children}</View>;
}
