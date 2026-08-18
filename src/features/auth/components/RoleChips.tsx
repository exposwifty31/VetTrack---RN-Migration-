/**
 * RN port of the web RoleChips (single-select role pre-selection, C5). The
 * chips are literal `vt_users.role` values so a downstream consumer of the
 * requested-role tag never needs to remap them. Radio-group semantics via
 * accessibilityRole/State; selection is controlled by the parent.
 *
 * RTL: the row relies on RN's automatic flex-row mirroring — no row-reverse
 * (I18nManager already flips row order in RTL; reversing again would UN-flip).
 * Aurora: opaque token surfaces, PressableScale press feedback only, no color
 * or layout animation.
 */
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PressableScale } from "@/components/PressableScale";
import type { SignupRequestedRole } from "../requested-role-store";

const ROLE_OPTIONS: { role: SignupRequestedRole; labelKey: "signIn.roleVetTech" | "signIn.roleVeterinarian" }[] = [
  { role: "technician", labelKey: "signIn.roleVetTech" },
  { role: "vet", labelKey: "signIn.roleVeterinarian" },
];

type RoleChipsProps = Readonly<{
  selectedRole: SignupRequestedRole | null;
  onSelectRole: (role: SignupRequestedRole) => void;
}>;

export function RoleChips({ selectedRole, onSelectRole }: RoleChipsProps) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-2">
      <Text className="font-rubik-semibold text-[11px] uppercase tracking-widest text-muted">
        {t("signIn.roleSelectLabel")}
      </Text>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap justify-center gap-2">
        {ROLE_OPTIONS.map(({ role, labelKey }) => {
          const isSelected = selectedRole === role;
          return (
            <PressableScale
              key={role}
              testID={`role-chip-${role}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={t(labelKey)}
              className={
                isSelected
                  ? "h-8 items-center justify-center rounded-full bg-primary px-3.5"
                  : "h-8 items-center justify-center rounded-full border border-border bg-surface px-3.5"
              }
              onPress={() => onSelectRole(role)}
            >
              <Text
                className={
                  isSelected
                    ? "font-rubik-semibold text-[12px] text-primary-foreground"
                    : "font-rubik-semibold text-[12px] text-foreground"
                }
              >
                {t(labelKey)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <Text className="max-w-[240px] text-center font-rubik text-[11px] text-muted">
        {t("signIn.roleSelectHint")}
      </Text>
    </View>
  );
}
