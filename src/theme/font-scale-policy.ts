/**
 * OS Dynamic Type policy (F5) — the single ceiling every text primitive shares.
 *
 * React Native honours the OS text-size setting on `<Text>` and `<TextInput>`
 * by default (`allowFontScaling` defaults to true) and applies it with NO
 * ceiling unless a `maxFontSizeMultiplier` is supplied per node. This app
 * shipped without one anywhere, so at the top OS accessibility sizes a Code
 * Blue action can grow until it wraps out of the viewport — the emergency
 * control becomes unreachable, which is a safety failure, not a cosmetic one.
 *
 * WHY 2, and what it costs:
 * 2.0x is WCAG 2.1 SC 1.4.4 (Resize Text, AA): text must scale to 200% without
 * loss of content or functionality. Anchoring the cap to the normative bar
 * means the ceiling itself can never be the thing that fails the standard —
 * which is the risk with a hand-picked "looks fine on my device" number.
 *
 * The trade is real and it is paid by the users who need text most: iOS
 * accessibility sizes (AX1–AX5) run past 2x, and Android's largest font-scale
 * setting reaches it, so those users get 200% instead of the larger value the
 * OS offered. What they keep: the full 200%, unchanged VoiceOver/TalkBack
 * output (a font ceiling does not touch the accessibility tree or spoken
 * content), and OS screen zoom / magnifier, which are unaffected by this prop.
 * What an UNcapped app would cost them instead is the emergency action itself
 * — total loss of functionality beats bounded-at-200% every time.
 *
 * `allowFontScaling` stays true forever. The cap is a ceiling, never an off
 * switch: turning OS Dynamic Type off would be the opposite accessibility bug.
 *
 * Per-call-site escape hatch: pass `maxFontSizeMultiplier={0}` (RN's "no max")
 * on a node that genuinely must follow the OS all the way — deliberate and
 * greppable, rather than a silent global default.
 */

/** WCAG 2.1 SC 1.4.4 (AA) resize bar — 200%. See the trade above before changing. */
export const MAX_FONT_SIZE_MULTIPLIER = 2;

export type FontScalePolicy = Readonly<{
  /** Never false — OS Dynamic Type stays on, the multiplier is only bounded. */
  allowFontScaling: true;
  maxFontSizeMultiplier: number;
}>;

/**
 * Spread onto `<Text>` / `<TextInput>`. One object so the two primitives can
 * never drift apart — `TextInput` has its own `maxFontSizeMultiplier` prop and
 * is the easy half to forget.
 */
export const FONT_SCALE_POLICY: FontScalePolicy = {
  allowFontScaling: true,
  maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
};
