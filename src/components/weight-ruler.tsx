import { memo, useCallback, useRef, useState } from 'react';
import { type FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { formatNumber } from '@/lib/metrics';
import { unitSystem, WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, spacing } from '@/theme';

// Space between two 0.1 marks, and the marks per whole unit.
const GAP = 9;
const SUB = 10;
const SEGMENT = GAP * SUB;
const RULER_H = 96;

// The ruler's range in the display unit (kg or lb).
const MIN = unitSystem === 'imperial' ? 40 : 20;
const MAX = unitSystem === 'imperial' ? 700 : 300;
const STEPS = (MAX - MIN) * SUB;
const UNITS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

const toValue = (step: number) => Math.round((MIN + step / SUB) * 10) / 10;
const toStep = (v: number) => Math.min(STEPS, Math.max(0, Math.round((v - MIN) * SUB)));

/**
 * Horizontal ruler scrolled under a fixed needle, one mark per 0.1 of the
 * display unit and a label on every whole one. The value follows the needle as it scrolls.
 */
export function WeightRuler({
  value,
  onChange,
}: {
  /** In the display unit; only read on mount. */
  value: number;
  onChange: (v: number) => void;
}) {
  const { width } = useWindowDimensions();
  const ref = useRef<FlatList<number>>(null);
  const [initialStep] = useState(() => toStep(value));
  const x = useSharedValue(initialStep * GAP);
  const step = useSharedValue(initialStep);
  const [current, setCurrent] = useState(initialStep);
  const positioned = useRef(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.set(e.contentOffset.x);
      step.set(Math.min(STEPS, Math.max(0, Math.round(e.contentOffset.x / GAP))));
    },
  });

  const select = (s: number) => {
    setCurrent(s);
    onChange(toValue(s));
  };

  useAnimatedReaction(
    () => step.get(),
    (s, previous) => {
      if (previous === null || s === previous) return;
      scheduleOnRN(select, s);
    },
  );

  const nudge = (by: number) => {
    const s = Math.min(STEPS, Math.max(0, current + by));
    ref.current?.scrollToOffset({ offset: s * GAP, animated: true });
  };

  const renderItem = useCallback(
    ({ item }: { item: number }) => <Segment unit={item} last={item === MAX} />,
    [],
  );

  return (
    <View
      style={[styles.ruler, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={tr('Вага', 'Weight')}
      accessibilityValue={{ text: `${formatNumber(toValue(current), 1)} ${WEIGHT_UNIT}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Animated.FlatList
        ref={ref}
        data={UNITS}
        horizontal
        keyExtractor={String}
        renderItem={renderItem}
        getItemLayout={(_, i) => ({ length: SEGMENT, offset: SEGMENT * i, index: i })}
        initialScrollIndex={Math.floor(initialStep / SUB)}
        contentContainerStyle={{ paddingHorizontal: width / 2 }}
        // initialScrollIndex lands on the whole unit; this moves on to the exact mark.
        onLayout={() => {
          if (positioned.current) return;
          positioned.current = true;
          ref.current?.scrollToOffset({ offset: initialStep * GAP, animated: false });
        }}
        showsHorizontalScrollIndicator={false}
        snapToInterval={GAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
      <View pointerEvents="none" style={[styles.needle, { left: width / 2 - 1.5 }]} />
      <View pointerEvents="none" style={[styles.pointer, { left: width / 2 - 7 }]} />
    </View>
  );
}

/** One whole unit: its labelled mark and the nine 0.1 marks after it. */
const Segment = memo(function Segment({ unit, last }: { unit: number; last: boolean }) {
  const major = unit % 5 === 0;
  return (
    <View style={[styles.segment, last && styles.segmentLast]}>
      <Text variant="caption" style={[styles.label, major && styles.labelMajor]}>
        {unit}
      </Text>
      {Array.from({ length: last ? 1 : SUB }, (_, i) => (
        <View
          key={i}
          style={[
            styles.mark,
            { left: i * GAP },
            i === 0 ? (major ? styles.markMajor : styles.markWhole) : i === 5 && styles.markHalf,
          ]}
        />
      ))}
    </View>
  );
});

/**
 * Bottom sheet with the weight ruler and a save button. Opens on `value` (in
 * the display unit), or stays closed while it is `null`.
 */
export function WeightRulerModal({
  value,
  onClose,
  onSave,
}: {
  value: number | null;
  onClose: () => void;
  /** In the display unit. */
  onSave: (v: number) => void;
}) {
  // Kept while the sheet slides away, so it doesn't go blank mid-animation.
  const [shown, setShown] = useState(value);
  if (value !== null && value !== shown) setShown(value);

  return (
    <BottomSheet visible={value !== null} onClose={onClose}>
      {shown !== null && <SheetContent initial={shown} onSave={onSave} />}
    </BottomSheet>
  );
}

function SheetContent({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [current, setCurrent] = useState(() => toValue(toStep(initial)));
  const delta = Math.round((current - initial) * 10) / 10;

  return (
    <View style={styles.content}>
      <Text variant="title" style={styles.title}>
        {tr('Вага', 'Weight')}
      </Text>

      <View style={styles.readout}>
        <Text style={styles.amount}>
          {current.toFixed(1)}
          <Text style={styles.unit}> {WEIGHT_UNIT}</Text>
        </Text>
        <Text variant="muted">
          {delta === 0
            ? tr('Гортай лінійку', 'Scroll the ruler')
            : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} ${WEIGHT_UNIT}`}
        </Text>
      </View>

      <WeightRuler value={initial} onChange={setCurrent} />

      <View style={styles.footer}>
        <Button title={tr('Зберегти', 'Save')} icon="checkmark" onPress={() => onSave(current)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ruler: { height: RULER_H, alignSelf: 'center' },
  segment: { width: SEGMENT, height: RULER_H },
  segmentLast: { width: 0 },
  label: {
    position: 'absolute',
    top: 0,
    left: -24,
    width: 48,
    textAlign: 'center',
    color: colors.textMuted,
  },
  labelMajor: { color: colors.text, fontWeight: '700' },
  mark: {
    position: 'absolute',
    bottom: 22,
    width: 2,
    marginLeft: -1,
    height: 14,
    borderRadius: 1,
    backgroundColor: colors.textMuted,
  },
  markHalf: { height: 22, backgroundColor: colors.textSecondary },
  markWhole: { height: 28, backgroundColor: colors.textSecondary },
  markMajor: { height: 40, backgroundColor: colors.text },
  needle: {
    position: 'absolute',
    bottom: 22,
    width: 3,
    height: 56,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  pointer: {
    position: 'absolute',
    bottom: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.accent,
  },
  content: { gap: spacing.lg },
  title: { textAlign: 'center' },
  readout: { alignItems: 'center', gap: spacing.xs },
  amount: {
    color: colors.text,
    fontSize: fontSize.hero,
    fontWeight: '800',
    letterSpacing: -1,
  },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  footer: { paddingHorizontal: spacing.lg },
});
