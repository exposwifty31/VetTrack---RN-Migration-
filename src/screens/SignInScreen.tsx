import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useSignInFlow } from "@/infrastructure/auth/useSignInFlow";
import { decodeJwtPayload, isValidJwt, resolveToken } from "@/lib/auth-fetch";
import type { RootStackScreenProps } from "../navigation/types";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * Minimal Clerk email/password sign-in for G1 Slice 3.
 * Errors surface generic, localized copy — never raw provider messages. A
 * DEV-only console diagnostic records azp presence (G1 gating check); server
 * authorization internals are never rendered to end users.
 */
export function SignInScreen(props: RootStackScreenProps<"SignIn">) {
  const { t } = useTranslation();
  if (!publishableKey) {
    return (
      <View className="flex-1 gap-3 bg-background px-6 pt-6">
        <Text className="text-2xl font-bold text-foreground">{t("signIn.title")}</Text>
        <Text className="text-[14px] text-muted">{t("signIn.missingKey")}</Text>
        <Pressable
          className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
          accessibilityRole="button"
          onPress={() => props.navigation.navigate("Main")}
        >
          <Text className="text-[15px] font-semibold text-foreground">{t("common.back")}</Text>
        </Pressable>
      </View>
    );
  }

  return <ClerkSignInForm {...props} />;
}

/**
 * Dev-only azp gating diagnostic (G1). NEVER surfaced to end users — the
 * server-authorization internals stay in the developer console.
 *
 * Extracted from `onSubmit`, and it swallows its own errors on purpose: this
 * runs AFTER signIn.finalize() has established the session, so a rejecting
 * resolveToken() propagating out would paint "sign-in failed" over a sign-in
 * that worked. A diagnostic must never change the verdict on the thing it is
 * diagnosing.
 */
async function logAzpDiagnostic(): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, 0));
    const token = await resolveToken();
    if (!token || !isValidJwt(token)) return;
    const azp = decodeJwtPayload(token)?.azp;
    const state = typeof azp === "string" ? `present: ${azp}` : "absent";
    console.debug(`[SignIn] azp ${state}`);
  } catch (diagnosticError) {
    console.debug("[SignIn] azp diagnostic failed", diagnosticError);
  }
}

export function ClerkSignInForm({ navigation }: RootStackScreenProps<"SignIn">) {
  const { t } = useTranslation();
  // Port adapter (PR #75 review): the SignInFlowPort owns Clerk's hooks and
  // the v4 password->status->finalize mechanism; this screen only maps
  // outcomes to state/copy and never imports Clerk.
  const flow = useSignInFlow();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (flow.isSignedIn) {
    return (
      <View className="flex-1 gap-3 bg-background px-6 pt-6">
        <Text className="text-2xl font-bold text-foreground">{t("signIn.signedInTitle")}</Text>
        <Pressable
          className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
          accessibilityRole="button"
          onPress={() => navigation.navigate("Main")}
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">{t("signIn.goHome")}</Text>
        </Pressable>
      </View>
    );
  }

  const onSubmit = async () => {
    if (!flow.ready) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await flow.submitPassword(email.trim(), password);
      if (outcome.kind === "complete") {
        if (__DEV__) await logAzpDiagnostic();
      } else if (outcome.kind === "incomplete") {
        setError(t("signIn.incomplete", { status: outcome.status }));
      } else {
        if (__DEV__) console.debug("[SignIn] sign-in failed", outcome.cause);
        setError(t("signIn.error"));
      }
    } catch (err) {
      if (__DEV__) console.debug("[SignIn] sign-in failed", err);
      setError(t("signIn.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">{t("signIn.title")}</Text>
      <Text className="text-[14px] text-muted">{t("signIn.subtitle")}</Text>

      <TextInput
        className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder={t("signIn.email")}
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground"
        secureTextEntry
        placeholder={t("signIn.password")}
        placeholderTextColor="#64748b"
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        testID="signin-submit"
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        disabled={busy || !flow.ready}
        onPress={() => {
          void onSubmit();
        }}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-[15px] font-semibold text-primary-foreground">{t("signIn.submit")}</Text>
        )}
      </Pressable>

      {error ? <Text className="text-[14px] text-danger">{error}</Text> : null}
    </View>
  );
}
