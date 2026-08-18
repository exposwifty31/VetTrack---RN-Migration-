import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { SsoStrategy } from "@/core/ports/sign-in-flow.port";
import { resolveAuthCardLayout } from "@/features/auth/auth-card-layout";
import { RoleChips } from "@/features/auth/components/RoleChips";
import {
  readCarriedRole,
  writeCarriedRole,
  type SignupRequestedRole,
} from "@/features/auth/requested-role-store";
import { useSignInFlow } from "@/infrastructure/auth/useSignInFlow";
import { decodeJwtPayload, isValidJwt, resolveToken } from "@/lib/auth-fetch";
import { useIsTablet } from "@/lib/use-is-tablet";
import type { RootStackScreenProps } from "../navigation/types";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

type SignInNavigation = RootStackScreenProps<"SignIn">["navigation"];

/**
 * Leave SignIn. SignIn is PUSHED OVER `Main` (BootstrapGate re-auth,
 * MenuScreen sign-out), so the way off it is a POP, not a navigate.
 *
 * React Navigation 7 changed `navigate`: its StackRouter reuses an existing
 * route only when that route is the CURRENT one, or when `popTo` sets
 * `payload.pop` — otherwise it appends a brand-new route. So `navigate("Main")`
 * from SignIn could never dismiss SignIn; it stacked a duplicate MainTabs
 * underneath a screen that stayed put, which on device reads as a dead button
 * (verified iPad sim 2026-08-19).
 *
 * `navigate` survives only as the cold-boot fallback: when SignIn is the sole
 * route (deep link / first launch) there is nothing to pop to, and pushing Main
 * is exactly right.
 */
function dismissToHome(navigation: SignInNavigation): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  navigation.navigate("Main");
}

/**
 * Branded sign-in (W-AUTH PR-B) — parity with web `signin.tsx`: VetTrack
 * branding, role pre-selection chips (C5), email/password via the
 * SignInFlowPort adapter, Apple/Google browser SSO, the Israeli phone-format
 * hint, and the Slice-13 tablet centered card. Errors surface generic,
 * localized copy — never raw provider messages. A DEV-only console diagnostic
 * records azp presence (G1 gating check); server authorization internals are
 * never rendered to end users.
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
          onPress={() => dismissToHome(props.navigation)}
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
 * Extracted from the submit handlers, and it swallows its own errors on
 * purpose: this runs AFTER the session is established, so a rejecting
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
  const isTablet = useIsTablet();
  const [role, setRole] = useState<SignupRequestedRole | null>(() => readCarriedRole());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ssoInFlightRef = useRef(false);
  // Post-`finalize()` the session is live and a sign-in screen is dead UX, so
  // dismiss without waiting for a button press. Gated on the TRANSITION, not on
  // `isSignedIn` alone: BootstrapGate's re-auth path routes here with a session
  // that may still be active (its `signOut()` failure is caught, not fatal), and
  // auto-dismissing on mount would bounce the user straight back to the gate
  // they came from — the form has to stay reachable. Latched so a re-render
  // cannot pop twice.
  const pendingAutoDismissRef = useRef(!flow.isSignedIn);
  useEffect(() => {
    if (!flow.isSignedIn || !pendingAutoDismissRef.current) return;
    if (!navigation.canGoBack()) return; // cold boot: the button is the affordance
    pendingAutoDismissRef.current = false;
    navigation.goBack();
  }, [flow.isSignedIn, navigation]);

  if (flow.isSignedIn) {
    return (
      <View className="flex-1 gap-3 bg-background px-6 pt-6">
        <Text className="text-2xl font-bold text-foreground">{t("signIn.signedInTitle")}</Text>
        <PressableScale
          className="items-center rounded-xl bg-primary py-3.5"
          accessibilityRole="button"
          onPress={() => dismissToHome(navigation)}
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">{t("signIn.goHome")}</Text>
        </PressableScale>
      </View>
    );
  }

  // ClerkLoading analog: gate the whole form until the SDK client resolves.
  if (!flow.isLoaded) {
    return (
      <View testID="signin-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  const submitting = busy || flow.fetchStatus === "fetching";

  const onSubmit = async () => {
    if (!flow.ready || submitting) return;
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

  const onSso = async (strategy: SsoStrategy) => {
    // Same-tick double-tap window: two taps can land before React re-renders,
    // so the render-scope `submitting` and the `disabled` prop alone cannot
    // stop the second one — the ref is the event-time truth (QrScanner
    // precedent), `busy` still drives the visual disabled state.
    if (ssoInFlightRef.current || submitting) return;
    ssoInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const outcome = await flow.startSso(strategy);
      // "dismissed" (user closed the browser) is SILENT by port contract —
      // cancellation is not a failure and must never paint error copy.
      if (outcome.kind === "activated" && __DEV__) await logAzpDiagnostic();
    } catch (err) {
      if (__DEV__) console.debug("[SignIn] SSO failed", err);
      setError(t("signIn.error"));
    } finally {
      ssoInFlightRef.current = false;
      setBusy(false);
    }
  };

  const onSelectRole = (nextRole: SignupRequestedRole) => {
    // Visual selection first — it must survive a persistence failure.
    setRole(nextRole);
    try {
      writeCarriedRole(nextRole);
    } catch (err) {
      // Adapter-unavailable propagates loud from the store (repo guideline);
      // the screen surfaces localized feedback and sign-in stays usable.
      if (__DEV__) console.debug("[SignIn] role carry failed", err);
      setError(t("signIn.roleCarryFailed"));
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        testID="signin-card"
        // Slice-13 tablet: centered capped card on an opaque token surface
        // (never a new blur layer); phones keep the full-bleed column.
        style={resolveAuthCardLayout(isTablet)}
        className={isTablet ? "gap-3 rounded-lg border border-border bg-surface p-6" : "gap-3"}
      >
        <View className="mb-2 items-center gap-2">
          <Image
            source={require("../../assets/icon.png")}
            accessibilityIgnoresInvertColors
            style={{ width: 56, height: 56, borderRadius: 12 }}
          />
          <Text className="font-rubik-bold text-[20px] text-foreground">{t("signIn.brand")}</Text>
          <Text className="text-center font-rubik-bold text-2xl text-foreground">
            {t("signIn.welcomeBack")}
          </Text>
          <Text className="text-center font-rubik text-[14px] text-muted">
            {t("signIn.subtitle")}
          </Text>
        </View>

        <RoleChips selectedRole={role} onSelectRole={onSelectRole} />

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
        {flow.fieldErrors.identifier ? (
          <Text className="font-rubik text-[13px] text-danger">
            {t("signIn.identifierFieldError")}
          </Text>
        ) : null}
        <TextInput
          className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground"
          secureTextEntry
          placeholder={t("signIn.password")}
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
        />
        {flow.fieldErrors.password ? (
          <Text className="font-rubik text-[13px] text-danger">
            {t("signIn.passwordFieldError")}
          </Text>
        ) : null}

        <PressableScale
          testID="signin-submit"
          className="items-center rounded-xl bg-primary py-3.5"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || !flow.ready }}
          disabled={submitting || !flow.ready}
          onPress={() => {
            void onSubmit();
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-[15px] font-semibold text-primary-foreground">{t("signIn.submit")}</Text>
          )}
        </PressableScale>

        {/* iOS App Review: offering Google requires offering Apple — both, Apple first. */}
        <PressableScale
          testID="sso-apple"
          className="items-center rounded-xl border border-border bg-surface py-3.5"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || !flow.ready }}
          disabled={submitting || !flow.ready}
          onPress={() => {
            void onSso("oauth_apple");
          }}
        >
          <Text className="font-rubik-semibold text-[15px] text-foreground">
            {t("signIn.continueWithApple")}
          </Text>
        </PressableScale>
        <PressableScale
          testID="sso-google"
          className="items-center rounded-xl border border-border bg-surface py-3.5"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || !flow.ready }}
          disabled={submitting || !flow.ready}
          onPress={() => {
            void onSso("oauth_google");
          }}
        >
          <Text className="font-rubik-semibold text-[15px] text-foreground">
            {t("signIn.continueWithGoogle")}
          </Text>
        </PressableScale>

        {error ? <Text className="text-[14px] text-danger">{error}</Text> : null}

        <Text className="text-center font-rubik text-[12px] text-text-tertiary">
          {t("signIn.phoneHint")}
        </Text>

        {/* Clerk bot-protection mount point — SSO can create a sign-up. */}
        <View nativeID="clerk-captcha" testID="clerk-captcha" />
      </View>
    </ScrollView>
  );
}
