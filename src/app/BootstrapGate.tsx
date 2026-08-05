/**
 * Identity bootstrap gate for the hero flow. Renders `children` only once
 * `api.users.me()` has populated `currentUserId` AND `effectiveRole >= student`
 * (the UX pre-gate reads the SAME field the server enforces on scan). While the
 * identity query is pending it shows a spinner; on failure it shows a re-auth
 * message. `(rn-architecture: gate side-effects in a container, keep screens pure.)`
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { getCurrentUserId } from "@/lib/auth-store";
import { hasRoleAtLeast } from "@/lib/roles";

import { useIdentity } from "./useIdentity";

export function BootstrapGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const identity = useIdentity();

  if (identity.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
        <Text className="mt-3 text-[14px] text-muted">{t("common.loading")}</Text>
      </View>
    );
  }

  const ready =
    identity.isSuccess &&
    !!getCurrentUserId() &&
    hasRoleAtLeast(identity.data.effectiveRole, "student");

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-[15px] font-semibold text-danger">
          {t("bootstrap.reauth")}
        </Text>
        <Pressable
          className="items-center rounded-xl bg-primary px-6 py-3 active:opacity-80"
          accessibilityRole="button"
          onPress={() => {
            void identity.refetch();
          }}
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">
            {t("bootstrap.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}
