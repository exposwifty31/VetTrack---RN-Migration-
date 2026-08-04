import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";

import { api } from "@/lib/api";
import type { RootStackScreenProps } from "../navigation/types";

/** Temporary Slice-4 smoke: authenticated users.me via TanStack Query. */
export function ApiSmokeScreen(_props: RootStackScreenProps<"ApiSmoke">) {
  const meQuery = useQuery({
    queryKey: ["users", "me"],
    queryFn: () => api.users.me(),
    enabled: false,
  });

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">API smoke</Text>
      <Text className="text-[14px] text-muted">
        Requires EXPO_PUBLIC_API_ORIGIN + signed-in Clerk (or stored bearer) then users.me
      </Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => {
          void meQuery.refetch();
        }}
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          GET /api/users/me
        </Text>
      </Pressable>

      {meQuery.isFetching ? (
        <Text className="text-[14px] text-muted">Loading…</Text>
      ) : null}
      {meQuery.isError ? (
        <Text className="text-[14px] text-danger">
          {meQuery.error instanceof Error ? meQuery.error.message : String(meQuery.error)}
        </Text>
      ) : null}
      {meQuery.data ? (
        <Text className="text-[14px] text-foreground">
          {meQuery.data.email} · id={meQuery.data.id} · role={meQuery.data.role ?? "?"}
        </Text>
      ) : null}
    </View>
  );
}
