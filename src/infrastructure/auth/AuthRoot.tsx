/**
 * Clerk provider composition, extracted from App.tsx so the session-persistence
 * wiring is testable as RUNTIME BEHAVIOR (PR #75 review): the provider must
 * receive BOTH the publishable key and the SecureStore-backed token cache from
 * `@clerk/expo/token-cache` — losing either is invisible to typecheck and shows
 * up on device as "signed out after every restart".
 *
 * No key -> children render WITHOUT the provider (dev-bypass branch, unchanged
 * App semantics). The key defaults to the env read; App passes nothing.
 */
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

/** Runtime env read (call-time, injectable for tests via the prop below). */
export function resolveClerkPublishableKey(): string {
  return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
}

export function AuthRoot({
  children,
  publishableKey = resolveClerkPublishableKey(),
}: Readonly<{ children: ReactNode; publishableKey?: string }>) {
  if (!publishableKey) {
    return <>{children}</>;
  }
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      {children}
    </ClerkProvider>
  );
}
