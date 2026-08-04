import { useAuth, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { decodeJwtPayload, isValidJwt, resolveToken } from "@/lib/auth-fetch";
import type { RootStackScreenProps } from "../navigation/types";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * Minimal Clerk email/password sign-in for G1 Slice 3.
 * After success, decodes the session JWT to report azp presence (gating check).
 */
export function SignInScreen(props: RootStackScreenProps<"SignIn">) {
  if (!publishableKey) {
    return (
      <View className="flex-1 gap-3 bg-background px-6 pt-6">
        <Text className="text-2xl font-bold text-foreground">Sign in</Text>
        <Text className="text-[14px] text-muted">
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env, rebuild, then sign in to
          decode azp against resolveClerkAuthorizedParties.
        </Text>
        <Pressable
          className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
          accessibilityRole="button"
          onPress={() => props.navigation.navigate("Home")}
        >
          <Text className="text-[15px] font-semibold text-foreground">Back</Text>
        </Pressable>
      </View>
    );
  }

  return <ClerkSignInForm {...props} />;
}

function ClerkSignInForm({ navigation }: RootStackScreenProps<"SignIn">) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [azpNote, setAzpNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isSignedIn) {
    return (
      <View className="flex-1 gap-3 bg-background px-6 pt-6">
        <Text className="text-2xl font-bold text-foreground">Signed in</Text>
        {azpNote ? <Text className="text-[14px] text-muted">{azpNote}</Text> : null}
        <Pressable
          className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
          accessibilityRole="button"
          onPress={() => navigation.navigate("Home")}
        >
          <Text className="text-[15px] font-semibold text-primary-foreground">Go home</Text>
        </Pressable>
      </View>
    );
  }

  const onSubmit = async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    setAzpNote(null);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        // Bridge effect may not have flushed yet — pull via getToken on next tick.
        await new Promise((r) => setTimeout(r, 0));
        const token = await resolveToken();
        if (token && isValidJwt(token)) {
          const payload = decodeJwtPayload(token);
          const azp = payload?.azp;
          setAzpNote(
            typeof azp === "string"
              ? `azp present: ${azp} — add to resolveClerkAuthorizedParties if missing on server`
              : "azp absent — server allowlist check likely no-op for Expo tokens (record in PROOF)",
          );
        } else {
          setAzpNote(
            "Signed in; getter token not ready — use resolveToken after bridge mounts to decode azp",
          );
        }
      } else {
        setError(`Sign-in incomplete: status=${result.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">Sign in</Text>
      <Text className="text-[14px] text-muted">Clerk-Expo · SecureStore token cache</Text>

      <TextInput
        className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground"
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#64748b"
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        disabled={busy || !isLoaded}
        onPress={() => {
          void onSubmit();
        }}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-[15px] font-semibold text-primary-foreground">Sign in</Text>
        )}
      </Pressable>

      {error ? <Text className="text-[14px] text-danger">{error}</Text> : null}
      {azpNote ? <Text className="text-[14px] text-muted">{azpNote}</Text> : null}
    </View>
  );
}
