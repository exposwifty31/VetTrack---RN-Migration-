import type { AuthSessionPort } from "@/core/ports/auth.port";
import { resolveToken } from "@/lib/auth-fetch";

type SignOutFn = () => Promise<void>;

/**
 * AuthSessionPort over the Clerk token seam.
 * `getToken` reads whatever ClerkTokenBridge last injected via setClerkTokenGetter.
 */
export class ClerkAuthAdapter implements AuthSessionPort {
  private readonly listeners = new Set<(token: string | null) => void>();
  private readonly signOutFn: SignOutFn;

  constructor(signOutFn: SignOutFn) {
    this.signOutFn = signOutFn;
  }

  async getToken(): Promise<string | null> {
    return resolveToken();
  }

  async signOut(): Promise<void> {
    await this.signOutFn();
    this.emit(null);
  }

  onSessionChange(handler: (token: string | null) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /** Call when Clerk reports a session change so subscribers refresh. */
  notifySessionChange(token: string | null): void {
    this.emit(token);
  }

  private emit(token: string | null): void {
    for (const listener of this.listeners) {
      listener(token);
    }
  }
}
