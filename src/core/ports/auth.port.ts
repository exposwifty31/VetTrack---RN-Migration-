/** Framework-free auth session port (mirrors vettrack AuthSessionPort). */
export interface AuthSessionPort {
  getToken(): Promise<string | null>;
  signOut(): Promise<void>;
  onSessionChange(handler: (token: string | null) => void): () => void;
}
