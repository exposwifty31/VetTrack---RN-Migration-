/**
 * Session-stable identity via TanStack Query. `api.users.me()` is the ONLY /api
 * route allowed before `setCurrentUserId` runs (auth-fetch guards every other route
 * on a non-null userId that resets on every JS cold start). Resolving `me` here
 * populates it before any scan/list fires.
 *
 * `staleTime: Infinity` overrides the 5s default so the fetch happens once per
 * session; the shared `['users','me']` cache means mounting this on several screens
 * still fetches once. An auth transition (sign-out / account switch) drops the stale
 * userId and re-resolves. `(rn-architecture: gate side-effects in a container.)`
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { subscribeAuthChange } from "@/lib/auth-fetch";
import { setCurrentUserId } from "@/lib/auth-store";
import { api } from "@/lib/api";
import type { MeUser } from "@/types/api";

export const IDENTITY_QUERY_KEY = ["users", "me"] as const;

export function useIdentity() {
  const queryClient = useQueryClient();

  const query = useQuery<MeUser>({
    queryKey: IDENTITY_QUERY_KEY,
    queryFn: () => api.users.me(),
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    const unsubscribe = subscribeAuthChange((change) => {
      if (change === "cleared" || change === "changed") {
        // Drop the stale userId so no /api route runs with a dead identity.
        setCurrentUserId(null);
        void queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
      }
      if (change === "ready" || change === "changed") {
        void queryClient.refetchQueries({ queryKey: IDENTITY_QUERY_KEY });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}
