import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * G2.5 Aurora — bottom tabs wrap the Home level only (היום/ציוד/חירום/תפריט);
 * every other flow (Scan, ScanConfirm, debug screens) stays on the root stack.
 */
export type MainTabParamList = {
  Today: undefined;
  // Deliberately param-free: query-seeded equipment searches PUSH the
  // root-stack EquipmentList (its initialQuery seeds state at mount — a tab
  // instance would ignore new params after its first mount).
  EquipmentTab: undefined;
  Emergency: undefined;
  // G3 Slice 4 (the sanctioned MainTabs writer): custody-scoped roles (student)
  // get a Mine tab INSTEAD of Emergency — only one of the two is registered at
  // a time (see main-tab-set.ts). Web parity: NativeTabBar's custody-only swap.
  Mine: undefined;
  Menu: undefined;
};

/** Root navigation param list — typed so screens get type-safe navigation + route props. */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  SignIn: undefined;
  /**
   * Held while Clerk restores a persisted session. A real route rather than a
   * bare `null`, because a Stack.Navigator must always have at least one screen
   * — and because rendering SignIn during the restore flashes it in front of a
   * session that is about to come back.
   */
  AuthLoading: undefined;
  ApiSmoke: undefined;
  NfcSpike: undefined;
  StorageDebug: undefined;
  RealtimeDebug: undefined;
  I18nDebug: undefined;
  G2Measure: undefined;
  EquipmentList: { initialQuery?: string } | undefined;
  Scan: undefined;
  ScanConfirm: { equipmentId: string; prefill?: { name?: string; status?: string } };
  // G3 routes — pre-registered in Slice 1 (collision avoidance: later slices
  // build the screens without touching this shared param list again).
  EquipmentDetail: { equipmentId: string };
  Tasks: undefined;
  MyEquipment: undefined;
  Alerts: undefined;
  Rooms: undefined;
  RoomDetail: { roomId: string };
  ShiftChat: undefined;
  Handoff: undefined;
  Inventory: undefined;
  AutopilotQueue: undefined;
  // Settings — the home gear's real destination (param-free root-stack route,
  // distinct from the Menu tab the gear used to open by mistake).
  Settings: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/** Tab screens can also navigate the root stack (Scan, debug screens, …). */
export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
