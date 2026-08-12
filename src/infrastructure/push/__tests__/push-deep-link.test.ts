import { resolvePushNavTarget } from "../push-deep-link";

/**
 * ADR-009 routing decision: a notification tap DEEP-LINKS (navigate only) — this
 * pure function maps the server payload to a nav intent and never touches state.
 */
describe("resolvePushNavTarget", () => {
  it("routes a code_blue type to the Emergency screen", () => {
    expect(resolvePushNavTarget({ type: "code_blue_started" })).toEqual({ screen: "Emergency" });
  });

  it("routes an emergency type to the Emergency screen", () => {
    expect(resolvePushNavTarget({ type: "EMERGENCY_ALERT" })).toEqual({ screen: "Emergency" });
  });

  it("routes a code-blue url to the Emergency screen (hyphen + case-insensitive)", () => {
    expect(resolvePushNavTarget({ url: "/board/Code-Blue/123" })).toEqual({ screen: "Emergency" });
  });

  it("routes a non-emergency notification to Main", () => {
    expect(resolvePushNavTarget({ type: "equipment_return_reminder", url: "/equipment/42" })).toEqual({
      screen: "Main",
    });
  });

  it("routes undefined / empty data to Main (a tap never dead-ends)", () => {
    expect(resolvePushNavTarget(undefined)).toEqual({ screen: "Main" });
    expect(resolvePushNavTarget({})).toEqual({ screen: "Main" });
  });

  it("ignores non-string type/url fields without throwing", () => {
    expect(resolvePushNavTarget({ type: 7, url: { nested: true } } as Record<string, unknown>)).toEqual({
      screen: "Main",
    });
  });
});
