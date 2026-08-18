/**
 * Text primitives carrying the OS Dynamic Type ceiling (F5).
 *
 * Drop-in replacements for React Native's `Text` / `TextInput`: identical
 * props (including Uniwind's `className`, which these forward untouched), plus
 * `FONT_SCALE_POLICY` applied as a DEFAULT. The policy is spread first and the
 * caller's props second, so an explicit `maxFontSizeMultiplier` at a call site
 * still wins — see the escape hatch note in `font-scale-policy.ts`.
 *
 * Why a wrapper and not a global default: React 19 removed `defaultProps` for
 * function components, and RN 0.86's `Text` is a function component that reads
 * `maxFontSizeMultiplier` straight off props (Libraries/Text/Text.js) with no
 * provider or context to override — `TextAncestorContext` carries a boolean,
 * nothing more. The native side inherits the value only down a nested-text
 * chain (ReactCommon/.../TextAttributes.cpp), never from a `View`. So a
 * component seam is the only place the ceiling can be applied from JS.
 *
 * In the app these render through Uniwind's `Text`/`TextInput` (Metro rewrites
 * `react-native` imports in app source to `uniwind/components`), which spreads
 * `...props` onto the RN component — so the ceiling passes through unchanged.
 */
import { type ComponentProps, type ReactElement } from "react";
import { Text, TextInput } from "react-native";

import { FONT_SCALE_POLICY } from "./font-scale-policy";

export type AppTextProps = ComponentProps<typeof Text>;
export type AppTextInputProps = ComponentProps<typeof TextInput>;

export function AppText(props: AppTextProps): ReactElement {
  return <Text {...FONT_SCALE_POLICY} {...props} />;
}

export function AppTextInput(props: AppTextInputProps): ReactElement {
  return <TextInput {...FONT_SCALE_POLICY} {...props} />;
}
