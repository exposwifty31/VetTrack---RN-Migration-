/**
 * Icon-free honest empty state — muted text only, no illustration, no fetch.
 * Copy comes from the caller (i18n key) so the component stays namespace-free.
 */
import { Text, View } from "react-native";

type ListEmptyStateProps = Readonly<{
  title: string;
  /** Optional second, tertiary-tier line. */
  body?: string;
}>;

export function ListEmptyState({ title, body }: ListEmptyStateProps) {
  return (
    <View className="items-center justify-center gap-1.5 px-6 py-10">
      <Text className="text-center font-rubik-semibold text-[15px] text-muted">{title}</Text>
      {body ? (
        <Text className="text-center font-rubik text-[13px] text-text-tertiary">{body}</Text>
      ) : null}
    </View>
  );
}
