import { ActivityIndicator, View } from "react-native";

/**
 * Shown while Clerk restores a persisted session from SecureStore.
 *
 * This is deliberately not the SignIn screen. Clerk reports `isSignedIn: false`
 * before it has finished restoring, so rendering the auth branch during that
 * window flashes a sign-in form at a user who is already signed in — the exact
 * "signed out after every restart" impression the token cache exists to
 * prevent. It is also not `null`: a Stack.Navigator must always have at least
 * one screen.
 *
 * No copy, by choice — any wording here would be a claim about auth state that
 * has not resolved yet, and the window is short enough that text would flicker.
 */
export function AuthLoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}
