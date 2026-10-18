import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useMemo } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import dumbbell from '@/assets/animations/dumbbell.json';

// The source is drawn in black; every fill is repainted in the requested color.
const tinted = new Map<string, AnimationObject>();

function tint(color: string): AnimationObject {
  let animation = tinted.get(color);
  if (!animation) {
    const hex = color.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    animation = JSON.parse(JSON.stringify(dumbbell), (key, value) =>
      value?.ty === 'fl' ? { ...value, c: { ...value.c, k: [...rgb, 1] } } : value,
    ) as AnimationObject;
    tinted.set(color, animation);
  }
  return animation;
}

/** Loading indicator: a dumbbell whose plates slide onto the bar. `color` is a `#rrggbb` hex. */
export function Spinner({
  color,
  size = 32,
  style,
}: {
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const source = useMemo(() => tint(color), [color]);
  return <LottieView source={source} autoPlay loop style={[{ width: size, height: size }, style]} />;
}
