import { useAuth, useSignIn } from "@clerk/expo";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

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

/** The non-null SignInFuture resource from the v4 hook. */
type SignInResource = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;

type PasswordFlowOutcome =
  | { kind: "complete" }
  | { kind: "incomplete"; status: string }
  | { kind: "failed"; cause: unknown };

/**
 * The v4 method-based password flow as one pure sequence (extracted for S3776
 * cognitive-complexity — the component maps outcomes to state/copy). v4 flows
 * report failures as a returned `{ error }`, not a rejection — both paths end
 * in the same generic localized copy (never raw provider messages, which can
 * carry authorization internals). finalize() activates the created session
 * (replaces legacy setActive).
 */
async function runPasswordFlow(
  signIn: SignInResource,
  emailAddress: string,
  password: string,
): Promise<PasswordFlowOutcome> {
  const { error: passwordError } = await signIn.password({ emailAddress, password });
  if (passwordError) return { kind: "failed", cause: passwordError };
  if (signIn.status !== "complete") return { kind: "incomplete", status: signIn.status };
  const { error: finalizeError } = await signIn.finalize();
  if (finalizeError) return { kind: "failed", cause: finalizeError };
  return { kind: "complete" };
}

export function ClerkSignInForm({ navigation }: RootStackScreenProps<"SignIn">) {
  const { t } = useTranslation();
  // @clerk/expo v4 method-based custom flow: `signIn` is the mutable
  // SignInFuture resource (null until the SDK client loads) — the legacy
  // `isLoaded`/`setActive` destructure no longer exists on this hook.
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isSignedIn) {
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
    if (!signIn) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await runPasswordFlow(signIn, email.trim(), password);
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
        disabled={busy || !signIn}
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
