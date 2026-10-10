import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

import { Wheel } from '@/components/wheel';
import { display, FIELDS, numeric, toInputs, toValues, WHEELS } from '@/components/set-row';
import type { TrackingType, WorkoutSet } from '@/db/schema';
import type { SetValues } from '@/lib/metrics';
import { colors, radius, spacing } from '@/theme';

/**
 * Values of the set in progress, inside the player card: one wheel per field,
 * side by side like the iOS clock, so no keyboard is needed. Keyed by set id, so
 * it starts from that set's prefilled values. `children` renders below and gets
 * a reader for the values entered.
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

  return (
    <>
      <View style={styles.fields}>
        {FIELDS[type].map((f) => {
          const w = WHEELS[f.key];
          return (
            <Wheel
              key={f.key}
              value={numeric(f.key, inputs[f.key])}
              min={w.min}
              max={w.max}
              step={w.step}
              unit={f.label}
              format={w.format}
              onChange={(v) => setInputs((prev) => ({ ...prev, [f.key]: display(f.key, v) }))}
            />
          );
        })}
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
