/**
 * Aurora inline stroke icons — exact geometry from the design hand-off
 * (docs/design/aurora-home/DirAurora4.dc.html; 20×20 grid, stroke 1.7–1.8,
 * round caps, no icon font). Colors are passed in (theme-resolved by callers)
 * because icon color is not a `style` prop concern on Svg primitives.
 */
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

type IconProps = Readonly<{ color: string; size?: number }>;

type GlyphProps = Readonly<{ color: string }>;

export function SearchIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={9} cy={9} r={5.6} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={13.4} y1={13.4} x2={17} y2={17} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 3.4c-2.7 0-4.4 1.9-4.4 4.4v2.9L4 13.2h12l-1.6-2.5V7.8c0-2.5-1.7-4.4-4.4-4.4z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8.5 15.8a1.6 1.6 0 0 0 3 0" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SlidersIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Line x1={3} y1={5.5} x2={17} y2={5.5} stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={12.5} cy={5.5} r={2.1} fill={color} />
      <Line x1={3} y1={10} x2={17} y2={10} stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={7} cy={10} r={2.1} fill={color} />
      <Line x1={3} y1={14.5} x2={17} y2={14.5} stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={13.5} cy={14.5} r={2.1} fill={color} />
    </Svg>
  );
}

/* Tab glyphs — plain-View geometry lifted 1:1 from the hand-off tab bar. */

export function TodayGlyph({ color }: GlyphProps) {
  return (
    <View style={{ width: 15, height: 14, borderWidth: 2, borderColor: color, borderRadius: 4 }}>
      <View style={{ position: "absolute", top: 2, left: 1, right: 1, height: 2, backgroundColor: color }} />
    </View>
  );
}

export function EquipmentGlyph({ color }: GlyphProps) {
  return (
    <View style={{ gap: 3, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/** Emergency plus — danger family: static, never glassed, never animated. */
export function EmergencyGlyph({ color }: GlyphProps) {
  return (
    <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 16, height: 4.5, borderRadius: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", width: 4.5, height: 16, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/** Mine (my equipment) — person silhouette for the custody-scoped 4th tab. */
export function MineGlyph({ color }: GlyphProps) {
  return (
    <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ width: 6.5, height: 6.5, borderRadius: 999, backgroundColor: color }} />
      <View
        style={{
          marginTop: 1.5,
          width: 13,
          height: 6.5,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function MenuGlyph({ color }: GlyphProps) {
  return (
    <View style={{ flexDirection: "row", gap: 3.5, alignItems: "center" }}>
      <View style={{ width: 4.5, height: 4.5, borderRadius: 999, backgroundColor: color }} />
      <View style={{ width: 4.5, height: 4.5, borderRadius: 999, backgroundColor: color }} />
      <View style={{ width: 4.5, height: 4.5, borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}
