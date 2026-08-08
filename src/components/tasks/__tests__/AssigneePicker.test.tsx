/**
 * Interactive coverage for the FlashList-backed assignee picker (Slice 3b). The
 * pure row model (data + keys) is tested in task-form-derive.test.ts; this covers
 * what type-check / lint / export cannot see — that each chip renders, a tap fires
 * `onSelect` with the right id, and the controlled selection round-trips so the
 * tapped chip becomes `selected`.
 *
 * Scope note: FlashList is stubbed to a plain map (its RecyclerView won't mount
 * under jest without native layout). The stub re-renders every cell, so it proves
 * the render/tap/selection wiring but NOT recycling — the recycling case (cells
 * re-rendering when `selectedId` moves) is guaranteed in code by the `extraData`
 * prop on the real FlashList, verified there by reading, not by this test.
 */
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { AssigneePicker } from "../TaskFormControls";
import type { AssigneeOption } from "../task-form-derive";

// jest.mock is hoisted above the imports by babel-jest, so the mocks below apply
// to AssigneePicker's module graph despite appearing after the imports here.

// PressableScale pulls Reanimated/worklets, which can't init under jest (no
// native runtime). Swap it for a plain Pressable — it forwards the same
// accessibility + onPress props this test asserts, minus the scale animation.
jest.mock("@/components/PressableScale", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return { PressableScale: (props: Record<string, unknown>) => React.createElement(Pressable, props) };
});

// Stub FlashList to a plain horizontal map — enough to render + tap the chips.
jest.mock("@shopify/flash-list", () => {
  const React = require("react");
  const { View } = require("react-native");
  const FlashList = (props: {
    data?: readonly unknown[];
    renderItem: (a: { item: unknown; index: number }) => unknown;
    keyExtractor?: (item: unknown, index: number) => string;
    ItemSeparatorComponent?: () => unknown;
  }) => {
    const { data, renderItem, keyExtractor, ItemSeparatorComponent } = props;
    return React.createElement(
      View,
      null,
      (data ?? []).map((item: unknown, index: number) => {
        const key = keyExtractor ? keyExtractor(item, index) : String(index);
        const separator =
          index > 0 && ItemSeparatorComponent
            ? React.createElement(ItemSeparatorComponent, { key: `${key}-sep` })
            : null;
        return React.createElement(React.Fragment, { key }, separator, renderItem({ item, index }));
      }),
    );
  };
  return { FlashList };
});

const OPTIONS: AssigneeOption[] = [
  { id: "v1", label: "Dr. Bruce", role: "vet", onShift: true },
  { id: "t2", label: "Cara", role: "technician", onShift: false },
];

/** Controlled host so a tap round-trips selectedId back through props — the same
 *  controlled loop a real selection change travels through in TaskFormSheet. */
function Harness({ onSelectSpy }: { onSelectSpy: (id: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AssigneePicker
      options={OPTIONS}
      selectedId={selectedId}
      onSelect={(id) => {
        onSelectSpy(id);
        setSelectedId(id);
      }}
      loading={false}
    />
  );
}

describe("AssigneePicker (FlashList)", () => {
  it("renders the unassigned chip plus one chip per staffer", async () => {
    const { getByLabelText } = await render(
      <AssigneePicker options={OPTIONS} selectedId={null} onSelect={jest.fn()} loading={false} />,
    );
    // Unassigned starts selected; staff chips render their (LTR-isolated) labels.
    expect(getByLabelText("tasks.form.unassigned").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("⁦Dr. Bruce⁩")).toBeTruthy();
    expect(getByLabelText("⁦Cara⁩")).toBeTruthy();
  });

  it("fires onSelect and moves the selection to the tapped staffer", async () => {
    const onSelectSpy = jest.fn();
    const { getByLabelText } = await render(<Harness onSelectSpy={onSelectSpy} />);

    await act(async () => {
      fireEvent.press(getByLabelText("⁦Dr. Bruce⁩"));
    });

    expect(onSelectSpy).toHaveBeenCalledWith("v1");
    // Selection round-tripped through props → the tapped chip is now selected.
    expect(getByLabelText("⁦Dr. Bruce⁩").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("tasks.form.unassigned").props.accessibilityState.selected).toBe(false);
  });

  it("returns to unassigned via the unassigned chip", async () => {
    const onSelectSpy = jest.fn();
    const { getByLabelText } = await render(<Harness onSelectSpy={onSelectSpy} />);

    await act(async () => {
      fireEvent.press(getByLabelText("⁦Cara⁩"));
    });
    expect(getByLabelText("⁦Cara⁩").props.accessibilityState.selected).toBe(true);

    await act(async () => {
      fireEvent.press(getByLabelText("tasks.form.unassigned"));
    });
    expect(onSelectSpy).toHaveBeenLastCalledWith(null);
    expect(getByLabelText("tasks.form.unassigned").props.accessibilityState.selected).toBe(true);
    expect(getByLabelText("⁦Cara⁩").props.accessibilityState.selected).toBe(false);
  });
});
