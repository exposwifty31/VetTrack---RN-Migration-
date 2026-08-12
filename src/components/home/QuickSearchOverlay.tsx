/**
 * Quick equipment search — the home search icon opens this in place (no
 * navigation). A transient RN Modal following the ShiftAdjustmentSheet pattern
 * (transparent + onRequestClose), but BLUR-SAFE: a plain dim backdrop over an
 * opaque surface card, never a blur layer — the home GlassTopBar stays the app's
 * only blur surface (≤2-tier budget). Typeahead over the SAME server `?q=` search
 * the equipment list uses (shared `useEquipmentSearch`); selecting a result opens
 * EquipmentDetail.
 */
import { useEffect, useRef } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { useUniwind } from "uniwind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/PressableScale";
import { EquipmentRow } from "@/components/equipment/EquipmentRow";
import { SearchIcon } from "@/components/home/icons";
import { useEquipmentSearch } from "@/hooks/useEquipmentSearch";

type QuickSearchOverlayProps = Readonly<{
  visible: boolean;
  onClose: () => void;
  onSelect: (equipmentId: string) => void;
}>;

export function QuickSearchOverlay({ visible, onClose, onSelect }: QuickSearchOverlayProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Mount the content ONLY while open so its useEquipmentSearch query never
          runs (or fetches) behind a closed modal. */}
      {visible ? <QuickSearchContent onClose={onClose} onSelect={onSelect} /> : null}
    </Modal>
  );
}

function QuickSearchContent({
  onClose,
  onSelect,
}: Readonly<{ onClose: () => void; onSelect: (equipmentId: string) => void }>) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const light = theme === "light";
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { query, setQuery, items, isPending, isError, dataUpdatedAt } = useEquipmentSearch("");

  // autoFocus is unreliable inside a freshly-mounted Modal; focus once it settles.
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  return (
    <View className="flex-1 bg-black/40">
      <Pressable
        className="absolute inset-0"
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
      />
      <View
        className="mx-3 mb-3 flex-1 overflow-hidden rounded-[20px] border border-border bg-surface"
        style={{ marginTop: insets.top + 8 }}
      >
        <View className="min-h-[52px] flex-row items-center gap-2.5 border-b border-border px-4">
          <SearchIcon color={light ? "#5B5680" : "#A6A0C3"} size={18} />
          <TextInput
            ref={inputRef}
            className="flex-1 py-3 font-rubik text-[16px] text-foreground"
            placeholder={t("equipment.searchPlaceholder")}
            placeholderTextColor={light ? "#5B5680" : "#A6A0C3"}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            accessibilityLabel={t("equipment.searchPlaceholder")}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            className="h-11 w-11 items-center justify-center"
            onPress={onClose}
          >
            <Text className="font-rubik text-[17px] text-text-tertiary">✕</Text>
          </PressableScale>
        </View>

        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Text className="font-rubik text-[13px] text-muted">{t("common.loading")}</Text>
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center font-rubik text-[15px] text-danger">
              {t("equipment.loadError")}
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center font-rubik text-[15px] text-muted">
              {t("equipment.empty")}
            </Text>
          </View>
        ) : (
          <FlashList
            data={items}
            renderItem={({ item }) => (
              <EquipmentRow item={item} onPress={(it) => onSelect(it.id)} sampledAtMs={dataUpdatedAt} />
            )}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.status}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
        )}
      </View>
    </View>
  );
}
