import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * G2.5 Aurora — bottom tabs wrap the Home level only (היום/ציוד/חירום/תפריט);
 * every other flow (Scan, ScanConfirm, debug screens) stays on the root stack.
 */
export type MainTabParamList = {
  Today: undefined;
  EquipmentTab: { initialQuery?: string } | undefined;
  Emergency: undefined;
  Menu: undefined;
};

/** Root navigation param list — typed so screens get type-safe navigation + route props. */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  SignIn: undefined;
  ApiSmoke: undefined;
  NfcSpike: undefined;
  StorageDebug: undefined;
  RealtimeDebug: undefined;
  I18nDebug: undefined;
  G2Measure: undefined;
  EquipmentList: { initialQuery?: string } | undefined;
  Scan: undefined;
  ScanConfirm: { equipmentId: string; prefill?: { name?: string; status?: string } };
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
