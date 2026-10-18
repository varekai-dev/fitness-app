import { useEffect, useRef, type ReactNode } from 'react';
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Circle } from 'react-native-svg';

import { radius } from '@/theme';

/** How progress (rings, bars) eases to a new value. */
const GROW = { duration: 700, easing: Easing.out(Easing.cubic) };
const PRESS_SPRING = { damping: 15, stiffness: 400, mass: 0.6 };

/** Starts at 0 on mount and eases to `value`, again whenever it changes. */
export function useGrow(value: number) {
  const shared = useSharedValue(0);
  useEffect(() => {
    shared.set(withTiming(value, GROW));
  }, [value, shared]);
  return shared;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The filled part of a progress ring: a round-capped arc from the circle's start
 * (rotate the Svg to place it) over `progress` (0–1) of `sweep` of the circle,
 * growing to its value.
 */
export function GrowArc({
  size,
  stroke,
  color,
  progress,
  sweep = 1,
}: {
  size: number;
  stroke: number;
  color: string;
  progress: number;
  /** Share of the circle the full ring spans, e.g. 0.75 for a gauge open at the bottom. */
  sweep?: number;
}) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const p = useGrow(Math.min(Math.max(progress, 0), 1));
  const animatedProps = useAnimatedProps(() => ({
    // One dash the length of the circle, shifted so only the filled part shows.
    strokeDashoffset: length - p.get() * sweep * length,
    // A zero-length dash still draws its round caps as a dot.
    strokeOpacity: p.get() > 0.001 ? 1 : 0,
  }));
  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={r}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeDasharray={[length, length]}
      fill="none"
      animatedProps={animatedProps}
    />
  );
}

/** A horizontal track (`style`) whose `color` fill grows to `progress` (0–1). */
export function GrowBar({
  progress,
  color,
  style,
}: {
  progress: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useSharedValue(0);
  const p = useGrow(Math.min(Math.max(progress, 0), 1));
  const fill = useAnimatedStyle(() => ({ width: width.get() * p.get() }));
  return (
    <View style={style} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
      <Animated.View
        style={[{ height: '100%', borderRadius: radius.pill, backgroundColor: color }, fill]}
      />
    </View>
  );
}

/** A chart column that grows up to `height` px. */
export function GrowColumn({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const h = useGrow(height);
  const animated = useAnimatedStyle(() => ({ height: h.get() }));
  return <Animated.View style={[style, animated]} />;
}

/**
 * Scales its children with a little bounce the moment `reached` turns true, to
 * celebrate a goal met. Not on mount: a goal met earlier isn't news.
 */
export function GoalPulse({
  reached,
  children,
  style,
}: {
  reached: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const was = useRef(reached);
  useEffect(() => {
    if (reached && !was.current) {
      scale.set(
        withSequence(
          withTiming(1.15, { duration: 180, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 5, stiffness: 160 }),
        ),
      );
    }
    was.current = reached;
  }, [reached, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that springs down a little while held. `style` must be a plain style. */
export function PressScale({
  style,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e: GestureResponderEvent) => {
        scale.set(withSpring(scaleTo, PRESS_SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}

/**
 * A list row that fades in when added, fades out when removed and lets its
 * neighbours glide into place. Rows present when the screen first renders don't
 * fade in: `Screen` wraps its content in `LayoutAnimationConfig skipEntering`.
 */
export function ListRow({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}>
      {children}
    </Animated.View>
  );
}

/** Layout animation for neighbours of a removed or added row in lists without `ListRow`. */
export const ROW_LAYOUT = LinearTransition.duration(220);
