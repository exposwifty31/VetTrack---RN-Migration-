import { useTranslation } from "react-i18next";

/**
 * The narrow `t` these components actually use — a key plus optional
 * interpolation, returning a string.
 *
 * WHY NOT `ReturnType<typeof useTranslation>["t"]`, which is what four detail
 * cards and AlertRow used before: that is i18next's fully generic `t`, and its
 * overload set is instantiated against the entire resource key union at every
 * call site. Every `t(key, { count })` in the app therefore drew on ONE shared
 * instantiation-depth budget that grows with the locale files — and adding a
 * single plural set pushed it over. TypeScript reported TS2589 ("excessively
 * deep"), plus TS2322 because the return type widens out of `string` once
 * inference gives up.
 *
 * Fixing it per-file only moved the error to the next component that
 * interpolates a count: AlertRow, then CustodyCard. `Parameters<GenericT>` did
 * not help either — reading the overload set is itself the expensive part.
 *
 * So the budget is spent nowhere: one signature, one cast, in one file. The
 * trade is that key names in these five components are no longer checked by
 * inference; they are covered instead by the locale parity and plural suites,
 * which already fail on a key that exists in one locale and not the other.
 */
export type TFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * `useTranslation().t`, narrowed to {@link TFn}.
 *
 * The single cast in the codebase for this. It is sound in the direction that
 * matters at runtime — i18next really does return a string for these calls; the
 * generic signature only says otherwise because of the widening above.
 *
 * WHEN TO USE THIS, and when NOT to — the rule, because it is not "always":
 *
 *   Use `useT()` when the component PASSES `t` across a function boundary — to
 *   a helper, or down as a prop. That is what forces the generic signature to be
 *   written down as a type, and writing it down is what triggers TS2589. All
 *   eight current callers do exactly that (`t: TFn`).
 *
 *   Keep `useTranslation()` when `t` is only called inline in the component
 *   body. Over seventy files do, none of them trip, and converting them would
 *   trade real key-literal checking for a problem they do not have.
 *
 * So this is a seam for a specific shape, not a house style. If a component
 * that calls `t` inline starts handing it to a helper, that is the moment it
 * moves over — not before.
 */
export function useT(): TFn {
  const { t } = useTranslation();
  return t as unknown as TFn;
}
