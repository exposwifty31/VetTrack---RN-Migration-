/**
 * W-AUTH PR-B: pure layout decision for the sign-in card (two-pane-layout
 * precedent — the one rule that silently breaks the tablet surface is
 * unit-tested without a renderer). Slice-13 convention: the FORM factor comes
 * from useIsTablet (short-side >= 600); this module only maps it to style.
 */
import { AUTH_CARD_MAX_WIDTH, resolveAuthCardLayout } from "../auth-card-layout";

describe("resolveAuthCardLayout", () => {
  it("tablet: centered card capped at AUTH_CARD_MAX_WIDTH", () => {
    expect(resolveAuthCardLayout(true)).toEqual({
      width: "100%",
      alignSelf: "center",
      maxWidth: AUTH_CARD_MAX_WIDTH,
    });
  });

  it("phone: full-width, no cap", () => {
    const layout = resolveAuthCardLayout(false);
    expect(layout).toEqual({ width: "100%", alignSelf: "stretch" });
    expect("maxWidth" in layout).toBe(false);
  });

  it("the cap fits the web parity reference (max-w-sm class = 384px) within one card step", () => {
    // Not byte-parity — the RN card may breathe a little wider — but it must
    // stay in the same visual family as the web's centered auth column.
    expect(AUTH_CARD_MAX_WIDTH).toBeGreaterThanOrEqual(384);
    expect(AUTH_CARD_MAX_WIDTH).toBeLessThanOrEqual(480);
  });
});
