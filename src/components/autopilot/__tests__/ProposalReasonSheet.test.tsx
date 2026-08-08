/**
 * Sheet decision lock (Slice 11, CodeRabbit #33): while the reject/edit mutation
 * is in flight the sheet must stay put — Cancel disables and back/drag-dismiss
 * no-op — so a mid-flight dismissal can't hide the decision error (this sheet is
 * the only place it renders) or strand a second decision racing the first.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ProposalReasonSheet, type ProposalSheetSpec } from "../ProposalReasonSheet";

// Strip the reanimated/gesture/blur host so the sheet renders as plain views.
jest.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/PressableScale", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "dark" }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SPEC: ProposalSheetSpec = {
  token: "p1:reject",
  title: "autopilot.rejectSheet.title",
  placeholder: "autopilot.rejectSheet.placeholder",
  submitLabel: "autopilot.rejectSheet.submit",
  danger: true,
  maxLength: 500,
};

async function renderSheet(isPending: boolean, onClose = jest.fn()) {
  await render(
    <ProposalReasonSheet
      spec={SPEC}
      isPending={isPending}
      errorMessage={null}
      onSubmit={jest.fn()}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("ProposalReasonSheet cancel/dismiss lock", () => {
  it("disables Cancel and ignores the press while the decision is pending", async () => {
    const { onClose } = await renderSheet(true);

    const cancel = screen.getByLabelText("common.cancel");
    expect(cancel.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(cancel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Cancel when no decision is pending", async () => {
    const { onClose } = await renderSheet(false);

    const cancel = screen.getByLabelText("common.cancel");
    expect(cancel.props.accessibilityState.disabled).toBe(false);

    fireEvent.press(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
