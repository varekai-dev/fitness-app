import { memo, useMemo, useState } from 'react';
import { LogBox, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SheetScrollable } from '@/components/bottom-sheet';
import { Text } from '@/components/ui';
import { colors, fontSize, radius, spacing } from '@/theme';

const ITEM = 40;

// A wheel may sit inside a scrolling screen. It has a fixed height and scrolls on
// its own, so the nesting warning doesn't apply to it.
LogBox.ignoreLogs(['VirtualizedLists should never be nested inside plain ScrollViews']);

/**
 * Vertical wheel picker in the style of the iOS clock. Scrolling and the fade of
 * rows away from the centre run on the UI thread; the value is reported once the
 * wheel settles, so nothing re-renders while it spins.
 */
export function Wheel({
  value,
  min,
  max,
  step,
  unit,
  format,
  rows = 3,
  ticks = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format: (v: number) => string;
  /** Rows shown, an odd number: the middle one is selected. */
  rows?: number;
  /** Ruler marks along both sides, longer on every 5th and 10th value. */
  ticks?: boolean;
  onChange: (v: number) => void;
}) {
  const pad = (ITEM * (rows - 1)) / 2;
  const count = Math.round((max - min) / step) + 1;
  const toIndex = (v: number) => Math.min(count - 1, Math.max(0, Math.round((v - min) / step)));
  const [initialIndex] = useState(() => toIndex(value));
  const labels = useMemo(
    () => Array.from({ length: count }, (_, i) => format(min + i * step)),
    [count, format, min, step],
  );
  const y = useSharedValue(initialIndex * ITEM);

  // Rounded so float steps (0.1, 0.5) don't drift.
  const commit = (i: number) => onChange(Math.round((min + i * step) * 100) / 100);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      y.set(e.contentOffset.y);
    },
    onEndDrag: (e) => {
      scheduleOnRN(commit, Math.min(count - 1, Math.max(0, Math.round(e.contentOffset.y / ITEM))));
    },
    onMomentumEnd: (e) => {
      scheduleOnRN(commit, Math.min(count - 1, Math.max(0, Math.round(e.contentOffset.y / ITEM))));
    },
  });

  return (
    <View style={[styles.root, { height: ITEM * rows }]}>
      <View pointerEvents="none" style={[styles.band, { top: pad }]} />
      <SheetScrollable>
        <Animated.FlatList
          data={labels}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <Row
              label={item}
              index={index}
              y={y}
              tick={ticks ? tickSize(Math.round((min + index * step) / step)) : undefined}
            />
          )}
          getItemLayout={(_, i) => ({ length: ITEM, offset: ITEM * i, index: i })}
          initialScrollIndex={initialIndex}
          contentContainerStyle={{ paddingVertical: pad }}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialNumToRender={12}
          maxToRenderPerBatch={20}
          windowSize={5}
          nestedScrollEnabled
        />
      </SheetScrollable>
      <View pointerEvents="none" style={[styles.unitBox, { top: pad }]}>
        <Text variant="caption" style={styles.unit}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

type Tick = 'major' | 'mid' | 'minor';
const tickSize = (n: number): Tick => (n % 10 === 0 ? 'major' : n % 5 === 0 ? 'mid' : 'minor');
const TICK_W: Record<Tick, number> = { major: 28, mid: 20, minor: 12 };

const Row = memo(function Row({
  label,
  index,
  y,
  tick,
}: {
  label: string;
  index: number;
  y: SharedValue<number>;
  tick?: Tick;
}) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(y.get() / ITEM - index);
    return {
      opacity: interpolate(d, [0, 1, 2], [1, 0.35, 0.1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.8], Extrapolation.CLAMP) }],
    };
  });
  // Marks keep their size and fade less, so the ruler reads along the whole wheel.
  const markStyle = useAnimatedStyle(() => {
    const d = Math.abs(y.get() / ITEM - index);
    return { opacity: interpolate(d, [0, 3], [1, 0.4], Extrapolation.CLAMP) };
  });
  return (
    <View style={styles.row}>
      {tick && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, markStyle]}>
          {/* A mark on the value and a short one halfway to the next. */}
          <View style={[styles.mark, styles.markLeft, styles[tick], { width: TICK_W[tick] }]} />
          <View style={[styles.mark, styles.markRight, styles[tick], { width: TICK_W[tick] }]} />
          <View style={[styles.mark, styles.half, styles.markLeft]} />
          <View style={[styles.mark, styles.half, styles.markRight]} />
        </Animated.View>
      )}
      <Animated.View style={style}>
        <Text variant="title" style={styles.label}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  row: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  unitBox: { position: 'absolute', right: 12, height: ITEM, justifyContent: 'center' },
  unit: { color: colors.textSecondary },
  mark: { position: 'absolute', top: ITEM / 2 - 1, height: 2, borderRadius: 1 },
  markLeft: { left: spacing.md },
  markRight: { right: spacing.md + 24 },
  half: { top: ITEM - 1, width: 8, backgroundColor: colors.textMuted },
  major: { backgroundColor: colors.text },
  mid: { backgroundColor: colors.textSecondary },
  minor: { backgroundColor: colors.textMuted },
});
