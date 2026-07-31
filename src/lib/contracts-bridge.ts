/**
 * Slice 7 smoke import — pulls @vettrack/contracts and @vettrack/shared.
 * Value import from the shared barrel forces Metro through NodeNext `.js`
 * re-exports (R5) — a type-only import would be erased and skip the resolver.
 */
import { EMERGENCY_SERVER_ROUTE_ALLOWLIST } from "@vettrack/contracts";
import { INACTIVE_THRESHOLD_DAYS, type SystemRole } from "@vettrack/shared";

export function contractsBridgeSmoke(): {
  allowlistSize: number;
  inactiveThresholdDays: number;
  sampleRole: SystemRole;
} {
  return {
    allowlistSize: EMERGENCY_SERVER_ROUTE_ALLOWLIST.length,
    inactiveThresholdDays: INACTIVE_THRESHOLD_DAYS,
    sampleRole: "User",
  };
}
