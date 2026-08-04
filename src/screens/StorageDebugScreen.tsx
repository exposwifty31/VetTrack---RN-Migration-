import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  safeStorageGetItem,
  safeStorageRemoveItem,
  safeStorageSetItem,
} from "@/lib/safe-storage";
import type { RootStackScreenProps } from "../navigation/types";

const LOCAL_KEY = "vt.storage.debug.local";
const SESSION_KEY = "vt.storage.debug.session";

/**
 * Temporary G1 Slice-2 smoke screen: write/read local (MMKV) vs session (memory).
 * Local should survive app restart; session should not.
 */
export function StorageDebugScreen(_props: RootStackScreenProps<"StorageDebug">) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState<string | null>(null);
  const [sessionValue, setSessionValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((fn: () => void) => {
    try {
      setError(null);
      fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">{t("storageDebug.title")}</Text>
      <Text className="text-[14px] text-muted">{t("storageDebug.subtitle")}</Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() =>
          run(() => {
            const stamp = new Date().toISOString();
            safeStorageSetItem(LOCAL_KEY, stamp, "local");
            safeStorageSetItem(SESSION_KEY, stamp, "session");
            setLocalValue(safeStorageGetItem(LOCAL_KEY, "local"));
            setSessionValue(safeStorageGetItem(SESSION_KEY, "session"));
          })
        }
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">
          {t("storageDebug.writeBoth")}
        </Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() =>
          run(() => {
            setLocalValue(safeStorageGetItem(LOCAL_KEY, "local"));
            setSessionValue(safeStorageGetItem(SESSION_KEY, "session"));
          })
        }
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("storageDebug.readBoth")}</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() =>
          run(() => {
            safeStorageRemoveItem(LOCAL_KEY, "local");
            safeStorageRemoveItem(SESSION_KEY, "session");
            setLocalValue(safeStorageGetItem(LOCAL_KEY, "local"));
            setSessionValue(safeStorageGetItem(SESSION_KEY, "session"));
          })
        }
      >
        <Text className="text-[15px] font-semibold text-foreground">{t("storageDebug.clearBoth")}</Text>
      </Pressable>

      <Text className="mt-2 text-[14px] text-foreground">
        {t("storageDebug.localLabel", { value: localValue ?? t("storageDebug.nullValue") })}
      </Text>
      <Text className="text-[14px] text-foreground">
        {t("storageDebug.sessionLabel", { value: sessionValue ?? t("storageDebug.nullValue") })}
      </Text>
      {error ? <Text className="text-[14px] text-danger">{error}</Text> : null}
    </View>
  );
}
