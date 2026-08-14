/**
 * Global test setup — runs via `setupFilesAfterEnv` before every suite.
 *
 * SCOPE RULE: this file mocks ONLY modules that cannot LOAD under jest (a native
 * TurboModule/Nitro/bridge lookup that throws at import time). Anything that
 * loads and behaves correctly is left real, so suites keep testing real code.
 * Anything with divergent per-suite expectations (expo-crypto's randomUUID,
 * uniwind's theme, react-i18next's `t`, i18next itself) stays OUT — a global
 * mock there would silently override 100+ existing suites.
 *
 * A per-file `jest.mock()` still wins over anything here (test-file factories are
 * hoisted and re-register the specifier), so suites can override freely.
 *
 * The inline `global jest` directive below is deliberate: eslint.config.js scopes
 * the jest globals to the test-file globs only, and this root-level file matches
 * neither. ESLint 9 flat config no longer honors env-style directives, so the
 * global is declared per-file here rather than widening the shared eslint config.
 */
/* global jest */

// react-native-worklets 0.10 resolves NativeWorklets.native.ts under jest and
// throws "Cannot read properties of undefined (reading 'loadUnpackers')" at
// module scope. It is pulled in by react-native-reanimated's own index, so BOTH
// must be stubbed for any real screen to import. src uses only `scheduleOnRN`.
jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn, ...args) => fn?.(...args),
  scheduleOnUI: (fn, ...args) => fn?.(...args),
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  createWorkletRuntime: () => ({}),
}));

// react-native-reanimated 4.5. Its own `react-native-reanimated/mock` is NOT
// usable here: src/mock.ts re-requires the real ./index, which pulls the real
// worklets and throws again. So stub the exact surface src imports — verified by
// grepping every `from "react-native-reanimated"` statement in src/:
//   PressableScale, BottomSheet, CheckoutConfirm -> Animated, useAnimatedStyle,
//   useSharedValue, withSpring, withTiming;  useDualFrameSampler -> runOnUI,
//   useFrameCallback, useSharedValue.
// Reached extremely broadly (PressableScale -> ErrorNote -> most screens), which
// is why 6 suites mock @/components/PressableScale today.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const RN = require("react-native");
  // Animated.X renders the plain RN primitive so trees mount and queries match.
  const passthrough = (Component) => {
    const Wrapped = React.forwardRef((props, ref) =>
      React.createElement(Component, { ...props, ref }),
    );
    Wrapped.displayName = `Animated(${Component?.displayName ?? Component?.name ?? "Component"})`;
    return Wrapped;
  };
  const Animated = {
    View: passthrough(RN.View),
    Text: passthrough(RN.Text),
    Image: passthrough(RN.Image),
    ScrollView: passthrough(RN.ScrollView),
    FlatList: passthrough(RN.FlatList),
    createAnimatedComponent: passthrough,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    // Animations resolve to their target value immediately — deterministic, and
    // callers only ever read the settled value in assertions.
    withSpring: (toValue) => toValue,
    withTiming: (toValue) => toValue,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => factory(),
    useFrameCallback: () => ({ setActive: jest.fn(), isActive: false }),
    runOnUI: (fn) => fn,
  };
});

// react-native-mmkv v4 is Nitro-backed: `createMMKV()` reaches NitroModules at
// call time and throws "Failed to get NitroModules" under jest. The navigator
// graph reaches it through src/infrastructure/storage/defaultStorage.ts.
// Backed by a real in-memory Map so storage round-trips actually behave.
jest.mock("react-native-mmkv", () => {
  const stores = new Map();
  return {
    createMMKV: ({ id } = {}) => {
      const key = id ?? "default";
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        getString: (k) => (store.has(k) ? store.get(k) : undefined),
        set: (k, v) => {
          store.set(k, String(v));
        },
        remove: (k) => store.delete(k),
        delete: (k) => store.delete(k),
        clearAll: () => store.clear(),
        getAllKeys: () => [...store.keys()],
      };
    },
  };
});

// react-native-nfc-manager builds a `new NativeEventEmitter()` at module scope
// and throws "requires a non-null argument" under jest. Reached from
// ScanScreen -> useNfcAdvisoryScan and (in __DEV__, which jest sets) NfcSpikeScreen.
// Surface mirrors exactly what those two call. NOTE: the JS surface is untouched
// by patches/react-native-nfc-manager+3.17.2.patch (that patch is iOS .m only).
jest.mock("react-native-nfc-manager", () => {
  const decode = (bytes) =>
    typeof bytes === "string" ? bytes : String.fromCharCode(...Array.from(bytes ?? []));
  return {
    __esModule: true,
    default: {
      isSupported: jest.fn(async () => false),
      start: jest.fn(async () => {}),
      cancelTechnologyRequest: jest.fn(async () => {}),
      requestTechnology: jest.fn(async () => {}),
      getTag: jest.fn(async () => null),
      setEventListener: jest.fn(),
      unregisterTagEvent: jest.fn(async () => {}),
      registerTagEvent: jest.fn(async () => {}),
    },
    NfcTech: { Ndef: "Ndef", NfcA: "NfcA", MifareUltralight: "MifareUltralight" },
    NfcEvents: { DiscoverTag: "NfcManagerDiscoverTag", SessionClosed: "NfcManagerSessionClosed" },
    Ndef: {
      uri: { decodePayload: decode, encodePayload: (s) => s },
      text: { decodePayload: decode, encodePayload: (s) => s },
    },
  };
});
