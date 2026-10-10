import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { FIELDS, toInputs, toValues, type Inputs } from '@/components/set-row';
import { Text } from '@/components/ui';
import type { TrackingType, WorkoutSet } from '@/db/schema';
import {
  formatDuration,
  formatNumber,
  parseDecimal,
  parseDuration,
  type SetValues,
} from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

const STEP: Record<keyof Inputs, number> = { weight: 0.5, reps: 1, duration: 15, distance: 0.5 };

function step(key: keyof Inputs, value: string, direction: 1 | -1): string {
  if (key === 'duration') {
    const sec = Math.max(0, (parseDuration(value) ?? 0) + direction * STEP.duration);
    return formatDuration(sec);
  }
  const n = Math.max(0, (parseDecimal(value) ?? 0) + direction * STEP[key]);
  return formatNumber(n);
}

/**
 * Big inputs with −/+ steppers for the set in progress, shown inside the
 * player card. Keyed by set id, so it starts from that set's prefilled values.
 * `children` renders below the inputs and gets a reader for the values entered.
 */
export function PlayerSetEditor({
  set,
  type,
  children,
}: {
  set: WorkoutSet;
  type: TrackingType;
  children: (values: () => SetValues) => ReactNode;
}) {
  const [inputs, setInputs] = useState(() => toInputs(set));
  const update = (key: keyof Inputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <View style={styles.fields}>
        {FIELDS[type].map((f) => (
          <View key={f.key} style={styles.field}>
            <Pressable
              hitSlop={6}
              style={styles.stepper}
              onPress={() => update(f.key, step(f.key, inputs[f.key], -1))}>
              <Ionicons name="remove" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.valueBox}>
              <TextInput
                value={inputs[f.key]}
                onChangeText={(v) => update(f.key, v)}
                keyboardType={
                  f.decimal ? 'decimal-pad' : f.time ? 'numbers-and-punctuation' : 'number-pad'
                }
                selectTextOnFocus
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                style={styles.value}
              />
              <Text variant="caption" style={styles.unit}>
                {f.label}
              </Text>
            </View>
            <Pressable
              hitSlop={6}
              style={styles.stepper}
              onPress={() => update(f.key, step(f.key, inputs[f.key], 1))}>
              <Ionicons name="add" size={18} color={colors.text} />
            </Pressable>
          </View>
        ))}
      </View>
      {children(() => toValues(inputs))}
    </>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];
type TransportButton = { icon: IconName; label: string; onPress: () => void; disabled?: boolean };
/** Holding the main button fills a ring around it and fires `onHold` once full. */
type MainButton = TransportButton & { holdIcon?: IconName; onHold?: () => void };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const HOLD_DELAY_MS = 150; // a quick tap never starts the ring
const HOLD_MS = 1000;
const RING = 86;
const RING_STROKE = 4;
const RING_R = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;

/** Media-player style controls: a big main action between two smaller ones. */
export function Transport({
  left,
  main,
  right,
}: {
  left: TransportButton;
  main: MainButton;
  right: TransportButton;
}) {
  return (
    <View style={styles.transport}>
      <TransportIcon {...left} />
      <HoldButton {...main} />
      <TransportIcon {...right} />
    </View>
  );
}

function HoldButton({ icon, holdIcon, label, onPress, onHold, disabled }: MainButton) {
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const iconTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Set once the hold completes, so releasing afterwards isn't also a tap.
  const fired = useRef(false);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH * (1 - progress.get()),
  }));

  const complete = () => {
    fired.current = true;
    setHolding(false);
    progress.set(withTiming(0, { duration: 200 }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onHold?.();
  };

  const pressIn = () => {
    fired.current = false;
    if (!onHold) return;
    iconTimer.current = setTimeout(() => {
      setHolding(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, HOLD_DELAY_MS);
    progress.set(
      withDelay(
        HOLD_DELAY_MS,
        withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
          if (finished) scheduleOnRN(complete);
        }),
      ),
    );
  };

  const pressOut = () => {
    clearTimeout(iconTimer.current);
    if (fired.current) return;
    cancelAnimation(progress);
    progress.set(withTiming(0, { duration: 150 }));
    setHolding(false);
  };

  return (
    <View style={styles.mainWrap}>
      <Svg width={RING} height={RING} style={styles.ring}>
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          stroke={colors.accent}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          fill="none"
          animatedProps={ringProps}
        />
      </Svg>
      <Pressable
        onPress={() => !fired.current && onPress()}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.main, (pressed || disabled) && styles.dimmed]}>
        <Ionicons
          name={holding && holdIcon ? holdIcon : icon}
          size={34}
          color={colors.accentText}
        />
      </Pressable>
    </View>
  );
}

function TransportIcon({ icon, label, onPress, disabled }: TransportButton) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.side, (pressed || disabled) && styles.dimmed]}>
      <Ionicons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  stepper: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: { flex: 1, alignItems: 'center' },
  value: {
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 2,
  },
  unit: { color: colors.textSecondary, fontSize: 11, marginTop: -2 },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginTop: spacing.md,
  },
  side: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  // Starts the ring at 12 o'clock and fills clockwise.
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  main: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.5 },
});
