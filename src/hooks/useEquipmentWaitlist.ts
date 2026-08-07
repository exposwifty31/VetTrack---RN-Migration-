/**
 * Waitlist snapshot + join/leave mutations for one equipment unit.
 *
 * Deliberately NOT optimistic: queue position is server-assigned (a concurrent
 * joiner changes it), and both mutations return the fresh snapshot — apply that
 * authoritative body, then invalidate the key belt-and-suspenders. Failures
 * surface via mutation state (loud, never queued offline).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EquipmentWaitlistSnapshot } from "@vettrack/shared";

import { api, equipmentKeys } from "@/lib/api";

export function useEquipmentWaitlist(equipmentId: string) {
  const queryClient = useQueryClient();
  const queryKey = equipmentKeys.waitlist(equipmentId);

  const query = useQuery<EquipmentWaitlistSnapshot>({
    queryKey,
    queryFn: () => api.equipment.waitlist(equipmentId),
  });

  const applySnapshot = (snapshot: EquipmentWaitlistSnapshot) => {
    queryClient.setQueryData(queryKey, snapshot);
  };

  const join = useMutation({
    mutationFn: () => api.equipment.joinWaitlist(equipmentId),
    onSuccess: applySnapshot,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const leave = useMutation({
    mutationFn: () => api.equipment.leaveWaitlist(equipmentId),
    onSuccess: applySnapshot,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return { query, join, leave };
}
