/**
 * Shared equipment search-query state + ETag-threaded fetch, extracted from
 * EquipmentListScreen so the list screen and the home QuickSearchOverlay drive
 * the SAME server-side `?q=` search with no drift. Behavior is a verbatim lift:
 * a deferred query keeps typing responsive; the per-key ETag LRU serves 304s
 * from the React Query cache.
 *
 * Deliberately does NOT call `useEquipmentRealtimeSync` — freshness is owned by
 * the host (EquipmentListScreen and HomeScreen each mount it once, the frozen
 * SSE surface). A second subscription here would double-subscribe.
 */
import { useDeferredValue, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, equipmentKeys, type EquipmentListParams } from "@/lib/api";
import type { EquipmentListPage } from "@/types/api";

/** LRU bound for the per-search ETag map — plenty for a session of live search. */
const ETAG_CACHE_MAX = 50;

const EMPTY_PAGE: EquipmentListPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0,
  hasMore: false,
};

export type EquipmentSearch = Readonly<{
  query: string;
  setQuery: (next: string) => void;
  items: EquipmentListPage["items"];
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  dataUpdatedAt: number;
}>;

export function useEquipmentSearch(initialQuery = ""): EquipmentSearch {
  const queryClient = useQueryClient();

  const [query, setQuery] = useState(initialQuery);
  // useDeferredValue keeps typing responsive while the filtered query re-runs.
  const deferredQuery = useDeferredValue(query);
  const params: EquipmentListParams = deferredQuery ? { q: deferredQuery } : {};
  const queryKey = equipmentKeys.list(params);

  // ETag threading scoped PER query key: a shared single-slot ref would send one
  // search's ETag on another search's request, so a 304 would return the wrong
  // page. The map stores ONLY the ETag string — 304 bodies are served from the
  // query cache (`queryClient.getQueryData`), so distinct searches no longer
  // pin a full page each. The map itself is a small LRU (touch on read,
  // evict-oldest past ETAG_CACHE_MAX) so live search can't grow it unboundedly.
  // If the cached body is gone (gc), skip If-None-Match — a 304 with nothing
  // to serve would fabricate an empty page.
  const etagRef = useRef<Map<string, string>>(new Map());

  const listQuery = useQuery<EquipmentListPage>({
    queryKey,
    queryFn: async () => {
      const cacheKey = JSON.stringify(queryKey);
      const etags = etagRef.current;
      const cachedPage = queryClient.getQueryData<EquipmentListPage>(queryKey);
      const etag = cachedPage ? etags.get(cacheKey) : undefined;
      if (etag) {
        // LRU touch: re-insert so the hot key moves to the back of the map.
        etags.delete(cacheKey);
        etags.set(cacheKey, etag);
      }
      const res = await api.equipment.list(params, etag);
      if (res.status === 304) {
        return cachedPage ?? EMPTY_PAGE;
      }
      if (res.etag) {
        etags.delete(cacheKey);
        etags.set(cacheKey, res.etag);
        if (etags.size > ETAG_CACHE_MAX) {
          const oldest = etags.keys().next().value;
          if (oldest !== undefined) etags.delete(oldest);
        }
      } else {
        etags.delete(cacheKey);
      }
      return res.data;
    },
  });

  return {
    query,
    setQuery,
    items: listQuery.data?.items ?? [],
    isPending: listQuery.isPending,
    isError: listQuery.isError,
    isSuccess: listQuery.isSuccess,
    dataUpdatedAt: listQuery.dataUpdatedAt,
  };
}
