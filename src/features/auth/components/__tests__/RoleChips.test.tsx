/**
 * W-AUTH PR-B: RN port of the web RoleChips (single-select role pre-selection,
 * C5). Semantics pinned: literal `vt_users.role` values ("technician" | "vet"),
 * radio-group accessibility, selection is controlled by the parent.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";

import i18next from "@/i18n/config";

import { RoleChips } from "../RoleChips";

async function renderChips(
  selectedRole: "technician" | "vet" | null,
  onSelectRole: (role: "technician" | "vet") => void,
) {
  await render(
    <I18nextProvider i18n={i18next}>
      <RoleChips selectedRole={selectedRole} onSelectRole={onSelectRole} />
    </I18nextProvider>,
  );
}

describe("RoleChips", () => {
  it("renders both role chips with the select label and hint", async () => {
    await renderChips(null, jest.fn());
    expect(screen.getByTestId("role-chip-technician")).toBeTruthy();
    expect(screen.getByTestId("role-chip-vet")).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.roleSelectLabel"))).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.roleSelectHint"))).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.roleVetTech"))).toBeTruthy();
    expect(screen.getByText(i18next.t("signIn.roleVeterinarian"))).toBeTruthy();
  });

  it("pressing a chip reports the literal vt_users.role value", async () => {
    const onSelectRole = jest.fn();
    await renderChips(null, onSelectRole);

    await fireEvent.press(screen.getByTestId("role-chip-vet"));
    expect(onSelectRole).toHaveBeenCalledWith("vet");

    await fireEvent.press(screen.getByTestId("role-chip-technician"));
    expect(onSelectRole).toHaveBeenCalledWith("technician");
  });

  it("exposes radio semantics — the selected chip is checked, the other is not", async () => {
    await renderChips("vet", jest.fn());

    expect(screen.getByTestId("role-chip-vet").props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId("role-chip-technician").props.accessibilityState).toMatchObject({
      checked: false,
    });
  });
});
