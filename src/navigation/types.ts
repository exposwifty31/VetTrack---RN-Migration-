import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Root navigation param list — typed so screens get type-safe navigation + route props. */
export type RootStackParamList = {
  Home: undefined;
  NfcSpike: undefined;
  StorageDebug: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
