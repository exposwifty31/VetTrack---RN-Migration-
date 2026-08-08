/**
 * Dispense sheet (G3 Slice 10) — the screen's ONE blur layer (T2, via the
 * Slice-1 `BottomSheet`). Item picker + LTR quantity steppers + an emergency
 * toggle that, per the danger doctrine, is a SOLID danger fill with ZERO glass
 * and ZERO animation (plain Pressable, not PressableScale); the required bypass
 * reason is a segmented choice keyed off the closed server enum.
 *
 * Idempotency: the `Idempotency-Key` is minted ONCE per distinct payload and
 * held in a ref — a retry of the identical attempt reuses it so a network drop
 * after the server committed cannot double-decrement stock (the server replays
 * its cached result). `retry: 0` — fail loud, online-only (no offline queueing).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Crypto from "expo-crypto";

import { PrimaryButton, QuietButton } from "@/components/equipment/detail/DetailBits";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { RowSkeleton } from "@/components/ui/RowSkeleton";
import {
  containerKeys,
  containersApi,
  dispenseErrorMessageKey,
  restockApi,
  retryUnlessClientError,
  type DispenseErrorKey,
} from "@/lib/api/containers";
import { BYPASS_REASONS, type BypassReason, type DispenseRequest } from "@/types/containers";

import {
  buildDispenseRequest,
  dispensePayloadSignature,
  resolveStableIdempotencyKey,
  type IdempotencyEntry,
} from "./dispense-derive";
import { QuantityStepper } from "./QuantityStepper";

type ReasonKey =
  | "dispense.reason.EMERGENCY_CPR"
  | "dispense.reason.PROTOCOL_OVERRIDE"
  | "dispense.reason.TECH_ERROR";

const REASON_KEY: Record<BypassReason, ReasonKey> = {
  EMERGENCY_CPR: "dispense.reason.EMERGENCY_CPR",
  PROTOCOL_OVERRIDE: "dispense.reason.PROTOCOL_OVERRIDE",
  TECH_ERROR: "dispense.reason.TECH_ERROR",
};

export type DispenseSheetTarget = Readonly<{ id: string; name: string }>;

type DispenseSheetProps = Readonly<{
  container: DispenseSheetTarget;
  onClose: () => void;
}>;

export function DispenseSheet({ container, onClose }: DispenseSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: containerKeys.items(container.id),
    queryFn: () => restockApi.containerItems(container.id),
    retry: retryUnlessClientError,
  });

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isEmergency, setIsEmergency] = useState(false);
  const [bypassReason, setBypassReason] = useState<BypassReason | null>(null);
  const [errorKey, setErrorKey] = useState<DispenseErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const idempotencyRef = useRef<IdempotencyEntry | null>(null);

  const dispensable = useMemo(
    () => (itemsQuery.data?.lines ?? []).filter((line) => line.itemId != null && line.actual > 0),
    [itemsQuery.data],
  );

  const validation = useMemo(
    () => buildDispenseRequest({ quantities, isEmergency, bypassReason }),
    [quantities, isEmergency, bypassReason],
  );

  const dispenseMutation = useMutation({
    mutationFn: (vars: { payload: DispenseRequest; key: string }) =>
      containersApi.dispense(container.id, vars.payload, vars.key),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: containerKeys.all });
      setDone(true);
    },
    onError: (error: unknown) => setErrorKey(dispenseErrorMessageKey(error)),
  });

  const setQty = useCallback((itemId: string, next: number) => {
    setQuantities((prev) => ({ ...prev, [itemId]: next }));
  }, []);

  const toggleEmergency = useCallback(() => {
    setIsEmergency((value) => !value);
    setBypassReason(null);
    setErrorKey(null);
  }, []);

  const chooseReason = useCallback((reason: BypassReason) => {
    setBypassReason(reason);
    setErrorKey(null);
  }, []);

  const onConfirm = useCallback(() => {
    setErrorKey(null);
    if (!validation.ok) return;
    const signature = dispensePayloadSignature(validation.payload);
    const entry = resolveStableIdempotencyKey(idempotencyRef.current, signature, Crypto.randomUUID);
    idempotencyRef.current = entry;
    dispenseMutation.mutate({ payload: validation.payload, key: entry.key });
  }, [validation, dispenseMutation]);

  const pending = dispenseMutation.isPending;
  const confirmLabel = pending ? t("dispense.confirming") : t("dispense.confirm");

  return (
    // Claim any touch not consumed by a sheet child so a tap in the dimmed area
    // above the sheet cannot fall through to the live container rows behind
    // (children keep responder priority, so buttons + the drag gesture still work).
    <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true}>
      <BottomSheet onDismiss={onClose}>
        <Text className="font-rubik-bold text-[20px] text-foreground">{t("dispense.title")}</Text>
        <Text
          className="mt-1 font-rubik-medium text-[15px] text-foreground"
          style={{ writingDirection: "ltr" }}
          numberOfLines={2}
        >
          {container.name}
        </Text>

        {itemsQuery.isPending ? (
          <View className="mt-4">
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : itemsQuery.isError ? (
          <View className="mt-4">
            <ErrorNote message={t("dispense.loadError")} onRetry={() => void itemsQuery.refetch()} />
          </View>
        ) : done ? (
          <View className="mt-4">
            <Text className="font-rubik-semibold text-[15px] text-success light:text-[#166534]">
              {t("dispense.success")}
            </Text>
            <View className="mt-4">
              <QuietButton label={t("dispense.close")} onPress={onClose} />
            </View>
          </View>
        ) : dispensable.length === 0 ? (
          <View className="mt-4">
            <Text className="font-rubik text-[14px] text-muted">{t("dispense.noItems")}</Text>
            <View className="mt-4">
              <QuietButton label={t("dispense.close")} onPress={onClose} />
            </View>
          </View>
        ) : (
          <View className="mt-4">
            <Text className="mb-1 font-rubik-semibold text-[13px] text-foreground">
              {t("dispense.itemsTitle")}
            </Text>
            <ScrollView
              style={{ maxHeight: 240 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {dispensable.map((line) => (
                <View
                  key={line.itemId as string}
                  className="flex-row items-center justify-between gap-3 border-b border-border py-2.5"
                >
                  <View className="flex-1">
                    <Text className="font-rubik-medium text-[14px] text-foreground" numberOfLines={2}>
                      {line.label}
                    </Text>
                    <Text className="mt-0.5 font-rubik text-[11px] text-text-tertiary">
                      {t("dispense.available")}{" "}
                      <Text style={{ writingDirection: "ltr" }}>{line.actual}</Text>
                    </Text>
                  </View>
                  <QuantityStepper
                    value={quantities[line.itemId as string] ?? 0}
                    max={line.actual}
                    onChange={(next) => setQty(line.itemId as string, next)}
                    decrementLabel={t("inventory.decrease")}
                    incrementLabel={t("inventory.increase")}
                  />
                </View>
              ))}
            </ScrollView>

            {/* Emergency toggle — solid danger fill, ZERO glass, ZERO animation. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isEmergency }}
              accessibilityLabel={t("dispense.emergencyToggle")}
              onPress={toggleEmergency}
              className={`mt-4 min-h-[48px] flex-row items-center justify-between rounded-[16px] px-4 py-3 ${
                isEmergency ? "bg-danger-solid" : "border border-border bg-surface"
              }`}
            >
              <Text
                className={`font-rubik-semibold text-[15px] ${
                  isEmergency ? "text-white" : "text-foreground"
                }`}
              >
                {t("dispense.emergencyToggle")}
              </Text>
              <Text className={`font-rubik-bold text-[14px] ${isEmergency ? "text-white" : "text-muted"}`}>
                {isEmergency ? "●" : "○"}
              </Text>
            </Pressable>

            {isEmergency ? (
              <View className="mt-2">
                <Text className="font-rubik text-[12px] text-danger light:text-[#B91C1C]">
                  {t("dispense.emergencyHint")}
                </Text>
                <Text className="mt-3 font-rubik-semibold text-[13px] text-foreground">
                  {t("dispense.reasonTitle")}
                </Text>
                <View className="mt-2 gap-2">
                  {BYPASS_REASONS.map((reason) => {
                    const selected = bypassReason === reason;
                    return (
                      <Pressable
                        key={reason}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => chooseReason(reason)}
                        className={`min-h-[44px] justify-center rounded-[14px] px-4 py-2.5 ${
                          selected ? "bg-danger-solid" : "border border-border bg-surface"
                        }`}
                      >
                        <Text
                          className={`font-rubik-semibold text-[14px] ${
                            selected ? "text-white" : "text-foreground"
                          }`}
                        >
                          {t(REASON_KEY[reason])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {errorKey ? (
              <Text className="mt-3 font-rubik-semibold text-[14px] text-danger light:text-[#B91C1C]">
                {t(errorKey)}
              </Text>
            ) : null}

            <View className="mt-5">
              <PrimaryButton
                label={confirmLabel}
                onPress={onConfirm}
                disabled={!validation.ok || pending}
              />
            </View>
            <View className="mt-2.5">
              <QuietButton label={t("dispense.cancel")} onPress={onClose} disabled={pending} />
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}
