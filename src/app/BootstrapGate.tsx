/**
 * Identity bootstrap gate for the hero flow. Renders `children` only once
 * `api.users.me()` has populated `currentUserId` AND `effectiveRole >= student`
 * (the UX pre-gate reads the SAME field the server enforces on scan). While the
 * identity query is pending it shows a spinner; on failure it shows a re-auth
 * screen. `(rn-architecture: gate side-effects in a container, keep screens pure.)`
 *
 * Fix (a): when the gate fails with NO active session (signed-out cold start),
 * the retry-only screen was a dead-end — `refetch()` can only fail again without
 * a credential. It now routes to SignIn in that case; retry stays for the
 * signed-in-but-not-ready case (e.g. pending approval). The view decision lives
 * in the pure `resolveBootstrapView` so it is unit-tested.
 */
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getCurrentUserId } from "@/lib/auth-store";
import { isAuthSessionActive, subscribeAuthSession } from "@/infrastructure/auth/authSession";
import type { RootStackParamList } from "@/navigation/types";

import { resolveBootstrapView } from "./bootstrap-view";
import { useIdentity } from "./useIdentity";

export function BootstrapGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const identity = useIdentity();
  const hasActiveSession = useSyncExternalStore(subscribeAuthSession, isAuthSessionActive);

  const view = resolveBootstrapView({
    isPending: identity.isPending,
    isSuccess: identity.isSuccess,
    hasUserId: !!getCurrentUserId(),
    effectiveRole: identity.data?.effectiveRole,
    hasActiveSession,
  });

  if (view.kind === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
        <Text className="mt-3 text-[14px] text-muted">{t("common.loading")}</Text>
      </View>
    );
  }

  if (view.kind === "ready") {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
      <Text className="text-center text-[15px] font-semibold text-danger">
        {t("bootstrap.reauth")}
      </Text>
      {view.canSignIn ? (
        <Pressable
          className="items-center rounded-xl bg-primary px-6 py-3 active:opacity-80"
          accessibilityRole="button"
          onPress={() => navigation.navigate("SignIn")}
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">
            {t("bootstrap.signIn")}
          </Text>
        </Pressable>
      ) : null}
      {!view.canSignIn ? (
        <Pressable
          className="items-center rounded-xl border border-border px-6 py-3 active:opacity-80"
          accessibilityRole="button"
          onPress={() => {
            void identity.refetch();
          }}
        >
          <Text className="text-[15px] font-semibold text-foreground">{t("bootstrap.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
