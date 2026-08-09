/**
 * Locks the two decisions behind the tablet master/detail frame:
 * the responsive master width, and the derive-selection-from-data rule that
 * keeps the detail pane from outliving its row.
 */
import {
  MASTER_MAX_WIDTH,
  MASTER_MIN_WIDTH,
  resolveMasterWidth,
  resolveSelectedItem,
} from "../two-pane-layout";

describe("resolveMasterWidth", () => {
  test("uses ~42% of the frame between the floor and the cap", () => {
    // iPad mini portrait: 744 * 0.42 = 312.48 — inside both bounds.
    expect(resolveMasterWidth(744)).toBeCloseTo(312.48, 2);
  });

  test("caps at the max so a very wide iPad does not waste the detail pane", () => {
    expect(resolveMasterWidth(1366)).toBe(MASTER_MAX_WIDTH);
    expect(resolveMasterWidth(1024)).toBe(MASTER_MAX_WIDTH);
  });

  test("floors at the minimum so the master stays legible in a 50/50 split", () => {
    // 600 * 0.42 = 252 → floored.
    expect(resolveMasterWidth(600)).toBe(MASTER_MIN_WIDTH);
  });

  test("honours a caller-supplied cap", () => {
    expect(resolveMasterWidth(1366, 320)).toBe(320);
  });

  test("never exceeds the frame itself (the detail pane must stay visible)", () => {
    expect(resolveMasterWidth(200)).toBe(200);
  });

  test("degenerate widths fall back to the floor", () => {
    expect(resolveMasterWidth(0)).toBe(MASTER_MIN_WIDTH);
    expect(resolveMasterWidth(-10)).toBe(MASTER_MIN_WIDTH);
    expect(resolveMasterWidth(Number.NaN)).toBe(MASTER_MIN_WIDTH);
  });

  test("a degenerate cap falls back to the default cap", () => {
    expect(resolveMasterWidth(1366, 0)).toBe(MASTER_MAX_WIDTH);
    expect(resolveMasterWidth(1366, Number.NaN)).toBe(MASTER_MAX_WIDTH);
  });

  test("an explicit cap below the minimum still wins, so maxWidth is a real cap", () => {
    expect(resolveMasterWidth(744, 100)).toBe(100);
    // ...including when there is no room to apply the ratio at all.
    expect(resolveMasterWidth(0, 100)).toBe(100);
  });
});

describe("resolveSelectedItem", () => {
  const items = [{ id: "a", name: "alpha" }, { id: "b", name: "bravo" }] as const;

  test("nothing selected → placeholder", () => {
    expect(resolveSelectedItem(items, null)).toBeNull();
    expect(resolveSelectedItem(items, undefined)).toBeNull();
    expect(resolveSelectedItem(items, "")).toBeNull();
  });

  test("keeps a selection that is still in the list", () => {
    expect(resolveSelectedItem(items, "b")).toEqual({ id: "b", name: "bravo" });
  });

  test("drops a selection the data no longer contains (search/realtime moved it)", () => {
    expect(resolveSelectedItem(items, "c")).toBeNull();
    expect(resolveSelectedItem([], "a")).toBeNull();
  });
});
