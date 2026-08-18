/**
 * F5 — the capped text primitives, and proof they differ from the raw RN ones.
 *
 * The uncapped-baseline case is deliberate: it proves the assertion mechanism
 * can tell a capped node from an uncapped one, so a green run here cannot be
 * an artefact of `props.maxFontSizeMultiplier` always reading back whatever was
 * passed. RN `<Text>` renders with NO ceiling out of the box — that is the gap.
 */
import { render, screen } from "@testing-library/react-native";
import { Text as RawText, TextInput as RawTextInput } from "react-native";

import { MAX_FONT_SIZE_MULTIPLIER } from "../font-scale-policy";
import { AppText, AppTextInput } from "../ScaledText";

describe("baseline — the untreated React Native primitives", () => {
  it("renders <Text> with no ceiling at all", async () => {
    await render(<RawText>vitals</RawText>);

    expect(screen.getByText("vitals").props.maxFontSizeMultiplier).toBeUndefined();
  });

  it("renders <TextInput> with no ceiling at all", async () => {
    await render(<RawTextInput testID="raw-input" />);

    expect(screen.getByTestId("raw-input").props.maxFontSizeMultiplier).toBeUndefined();
  });
});

describe("AppText", () => {
  it("caps OS Dynamic Type at the policy multiplier", async () => {
    await render(<AppText>vitals</AppText>);

    expect(screen.getByText("vitals").props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it("leaves OS font scaling ON below the cap", async () => {
    await render(<AppText>vitals</AppText>);

    expect(screen.getByText("vitals").props.allowFontScaling).toBe(true);
  });

  it("still renders its children and forwards ordinary props", async () => {
    await render(<AppText numberOfLines={2}>vitals</AppText>);

    expect(screen.getByText("vitals").props.numberOfLines).toBe(2);
  });

  it("lets a call site opt out explicitly — 0 means no ceiling", async () => {
    await render(<AppText maxFontSizeMultiplier={0}>vitals</AppText>);

    expect(screen.getByText("vitals").props.maxFontSizeMultiplier).toBe(0);
  });
});

describe("AppTextInput", () => {
  it("caps OS Dynamic Type at the policy multiplier", async () => {
    await render(<AppTextInput testID="app-input" />);

    expect(screen.getByTestId("app-input").props.maxFontSizeMultiplier).toBe(
      MAX_FONT_SIZE_MULTIPLIER,
    );
  });

  it("leaves OS font scaling ON below the cap", async () => {
    await render(<AppTextInput testID="app-input" />);

    expect(screen.getByTestId("app-input").props.allowFontScaling).toBe(true);
  });
});
