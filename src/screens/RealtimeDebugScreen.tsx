import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type {
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeKeepalive,
} from "@/core/ports/realtime.port";
import { getDefaultRealtimePort } from "@/infrastructure/realtime/defaultRealtime";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * G1 Slice-5 smoke: open the SSE stream and PROVE the streaming XHR path works on
 * New Arch by observing a KEEPALIVE ({activeCodeBlueSessionId, stormHint}) land
 * within ~10s of connect with zero domain activity. Requires EXPO_PUBLIC_API_ORIGIN
 * + a signed-in Clerk session (or stored bearer). A cold-start "error" before
 * sign-in is EXPECTED, not a failure.
 */
export function RealtimeDebugScreen(_props: RootStackScreenProps<"RealtimeDebug">) {
  const port = getDefaultRealtimePort();
  const [state, setState] = useState<RealtimeConnectionState>(port.getState());
  const [cursor, setCursor] = useState<number>(port.getCursor());
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [keepalive, setKeepalive] = useState<RealtimeKeepalive | null>(null);
  const [resetReason, setResetReason] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const unsubscribe = port.subscribe((event: RealtimeEvent) => {
      switch (event.kind) {
        case "state":
          setState(event.state);
          break;
        case "event":
          setLastEventType(event.envelope.type);
          setCursor(port.getCursor());
          setEventCount((n) => n + 1);
          break;
        case "keepalive":
          setKeepalive(event.keepalive);
          break;
        case "reset":
          setResetReason(event.reason);
          setCursor(port.getCursor());
          break;
      }
    });
    return unsubscribe;
  }, [port]);

  return (
    <View className="flex-1 gap-3 bg-background px-6 pt-6">
      <Text className="text-2xl font-bold text-foreground">Realtime debug</Text>
      <Text className="text-[14px] text-muted">
        SSE /api/realtime/stream · foreground-only · replay-from-cursor. Expect a
        KEEPALIVE within ~10s of connect (proves streaming on New Arch).
      </Text>

      <Pressable
        className="items-center rounded-xl bg-primary py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => port.open()}
      >
        <Text className="text-[15px] font-semibold text-primary-foreground">Connect</Text>
      </Pressable>

      <Pressable
        className="items-center rounded-xl border border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
        onPress={() => port.close()}
      >
        <Text className="text-[15px] font-semibold text-foreground">Disconnect</Text>
      </Pressable>

      <Text className="mt-2 text-[14px] text-foreground">state: {state}</Text>
      <Text className="text-[14px] text-foreground">cursor: {cursor}</Text>
      <Text className="text-[14px] text-foreground">events: {eventCount}</Text>
      <Text className="text-[14px] text-foreground">
        last event type: {lastEventType ?? "(none)"}
      </Text>
      <Text className="text-[14px] text-foreground">
        keepalive:{" "}
        {keepalive
          ? `cb=${keepalive.activeCodeBlueSessionId ?? "none"} storm=${keepalive.stormHint}`
          : "(none yet)"}
      </Text>
      {resetReason ? (
        <Text className="text-[14px] text-danger">
          RESET_STATE: {resetReason} → full resync needed
        </Text>
      ) : null}
      {state === "error" ? (
        <Text className="text-[14px] text-muted">
          error state before sign-in is expected; sign in then Connect
        </Text>
      ) : null}
    </View>
  );
}
