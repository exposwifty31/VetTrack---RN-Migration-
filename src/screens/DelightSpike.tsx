import { useEffect } from "react";
import { Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * G2 delight-stack de-risk spike (temporary — delete once the gate is recorded).
 * The whole point: exercise a REAL worklet (`useAnimatedStyle` runs on the UI
 * thread) so the react-native-worklets Babel plugin actually transforms this
 * module. If worklets-under-SDK-57-Metro is what killed the bundler in the
 * NativeWind incident, bundling THIS file reproduces the transform-worker crash.
 */
export function DelightSpike() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [{ translateX: progress.value * 120 }, { scale: 1 + progress.value * 0.3 }],
      opacity: 0.5 + progress.value * 0.5,
    };
  });

  // FlashList 2 coexistence check (no estimatedItemSize — removed in v2).
  const rows = ["reanimated 4.5.1", "worklets 0.10.1", "gesture-handler 2.32", "flash-list 2.0.2"];

  return (
    <View className="gap-2">
      <View className="h-12 justify-center">
        <Animated.View
          style={animatedStyle}
          className="h-8 w-8 rounded-full bg-primary"
          accessibilityLabel="delight-spike"
        />
      </View>
      <View className="h-24">
        <FlashList
          data={rows}
          renderItem={({ item }) => <Text className="py-1 text-[13px] text-muted">{item}</Text>}
          keyExtractor={(item) => item}
        />
      </View>
    </View>
  );
}
