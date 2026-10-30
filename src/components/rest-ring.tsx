import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { formatDuration } from '@/lib/metrics';
import { colors, fontSize } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 196;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * R;

/** Rest countdown: an arc that empties clockwise around the time left. */
export function RestRing({ remainingSec, totalSec }: { remainingSec: number; totalSec: number }) {
  const fraction = totalSec > 0 ? Math.min(1, remainingSec / totalSec) : 0;
  const shown = useSharedValue(fraction);
  // The timer ticks a few times a second; easing between ticks keeps the arc smooth.
  useEffect(() => {
    shown.set(withTiming(fraction, { duration: 300, easing: Easing.linear }));
  }, [fraction, shown]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: LENGTH * (1 - shown.get()) }));

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE} style={styles.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.surfaceRaised}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          fill="none"
          animatedProps={arcProps}
        />
      </Svg>
      <Text variant="hero" style={styles.time}>
        {formatDuration(remainingSec)}
      </Text>
      <Text variant="caption" style={styles.label}>
        {t`ЗАЛИШИЛОСЬ`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Starts the arc at 12 o'clock.
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  time: { color: colors.text, fontSize: 52 },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
