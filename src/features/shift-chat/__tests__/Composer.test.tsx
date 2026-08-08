/**
 * Composer draft-retention (Slice 8) — the send is optimistic on SUCCESS only:
 * the draft clears once `onSend` resolves and is RETAINED when it rejects, so a
 * transient failure never discards the user-authored message. Rendered without
 * uniwind / Reanimated / i18n wiring: `useUniwind` and `useTranslation` are
 * stubbed and `PressableScale` is swapped for a plain `Pressable` so the test
 * exercises the submit contract, not the Aurora press primitive.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { Composer } from "../Composer";

// jest.mock is hoisted above the imports by babel-plugin-jest-hoist, so these
// apply before ../Composer resolves uniwind / react-i18next / PressableScale.
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "light" }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/components/PressableScale", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return {
    PressableScale: (props: Record<string, unknown>) => React.createElement(Pressable, props),
  };
});

const PLACEHOLDER = "shiftChat.placeholder";
const SEND_LABEL = "shiftChat.send";
const DRAFT = "handover done — vitals stable";

function renderComposer(onSend: (body: string) => Promise<void>) {
  return render(
    <Composer onSend={onSend} onTyping={jest.fn()} pending={false} hasError={false} />,
  );
}

describe("Composer", () => {
  it("clears the draft only after the send succeeds", async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByLabelText } = await renderComposer(onSend);

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), DRAFT);
    });
    await act(async () => {
      fireEvent.press(getByLabelText(SEND_LABEL));
    });

    expect(onSend).toHaveBeenCalledWith(DRAFT);
    await waitFor(() => expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe(""));
  });

  it("retains the draft when the send fails (message not lost)", async () => {
    const onSend = jest.fn().mockRejectedValue(new Error("network"));
    const { getByPlaceholderText, getByLabelText } = await renderComposer(onSend);

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), DRAFT);
    });
    await act(async () => {
      fireEvent.press(getByLabelText(SEND_LABEL));
    });

    expect(onSend).toHaveBeenCalledWith(DRAFT);
    // The composer keeps the user's text — a failed send never discards it.
    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe(DRAFT);
  });

  it("trims and does not send a whitespace-only draft", async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByLabelText } = await renderComposer(onSend);

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), "   ");
    });
    await act(async () => {
      fireEvent.press(getByLabelText(SEND_LABEL));
    });

    expect(onSend).not.toHaveBeenCalled();
  });
});
