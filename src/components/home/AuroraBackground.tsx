/**
 * The static aurora glow — two radial gradients painted ONCE behind the home
 * content (README.md §1). Zero GPU cost by doctrine: never animated, no
 * parallax, no shimmer. Geometry mirrors the CSS reference:
 *   violet 500×380 at (85%, -6%)  ·  cyan 440×340 at (8%, 108%)
 * with the fade completing at 65% of the radius.
 */
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { useUniwind } from "uniwind";

type GlowProps = {
  id: string;
  color: string;
  opacity: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

function Glow({ id, color, opacity, width, height, centerX, centerY }: GlowProps) {
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: "absolute", left: centerX - width / 2, top: centerY - height / 2 }}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.65" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const { theme } = useUniwind();
  const light = theme === "light";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Glow
        id="vt-aurora-violet"
        color={light ? "#6D28D9" : "#7C3AED"}
        opacity={light ? 0.1 : 0.34}
        width={500}
        height={380}
        centerX={0.85 * width}
        centerY={-0.06 * height}
      />
      <Glow
        id="vt-aurora-cyan"
        color={light ? "#0891B2" : "#22D3EE"}
        opacity={light ? 0.06 : 0.14}
        width={440}
        height={340}
        centerX={0.08 * width}
        centerY={1.08 * height}
      />
    </View>
  );
}
