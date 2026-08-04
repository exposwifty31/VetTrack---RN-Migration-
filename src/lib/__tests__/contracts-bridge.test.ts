import { contractsBridgeSmoke } from "../contracts-bridge";

describe("contractsBridgeSmoke", () => {
  it("reads EMERGENCY_SERVER_ROUTE_ALLOWLIST from @vettrack/contracts", () => {
    const result = contractsBridgeSmoke();
    expect(result.allowlistSize).toBeGreaterThan(0);
    expect(result.sampleRole).toBe("User");
  });

  it("reads a value export from @vettrack/shared (forces .js→.ts resolution in Metro)", () => {
    const result = contractsBridgeSmoke();
    expect(result.inactiveThresholdDays).toBe(14);
  });
});
