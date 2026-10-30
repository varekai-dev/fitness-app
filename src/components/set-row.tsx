import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, Text } from '@/components/ui';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { Wheel } from '@/components/wheel';
import type { TrackingType, WorkoutSet } from '@/db/schema';
import type { SetValues } from '@/lib/metrics';
import {
  formatDistance,
  formatDuration,
  formatNumber,
  formatWeight,
  parseDecimal,
  parseDuration,
} from '@/lib/metrics';
import { DISTANCE_UNIT, displayToKg, displayToKm, unitSystem, WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

export type Inputs = {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
};

/** Field text is in the chosen units; the values are stored in kg and km. */
export const toInputs = (s: SetValues): Inputs => ({
  weight: s.weightKg === null ? '' : formatWeight(s.weightKg),
  reps: s.reps === null ? '' : String(s.reps),
  duration: s.durationSec === null ? '' : formatDuration(s.durationSec),
  distance: s.distanceKm === null ? '' : formatDistance(s.distanceKm),
});

const orNull = <T,>(v: number | null, f: (n: number) => T) => (v === null ? null : f(v));

export const toValues = (i: Inputs): SetValues => {
  const reps = parseDecimal(i.reps);
  return {
    weightKg: orNull(parseDecimal(i.weight), displayToKg),
    reps: reps === null ? null : Math.round(reps),
    durationSec: parseDuration(i.duration),
    distanceKm: orNull(parseDecimal(i.distance), displayToKm),
  };
};

const REPS = t`повт`;
const MIN_SEC = t`хв:с`;

export const FIELDS: Record<TrackingType, { key: keyof Inputs; label: string }[]> = {
  weight_reps: [
    { key: 'weight', label: WEIGHT_UNIT },
    { key: 'reps', label: REPS },
  ],
  weighted_reps: [
    { key: 'weight', label: `+${WEIGHT_UNIT}` },
    { key: 'reps', label: REPS },
  ],
  reps: [{ key: 'reps', label: REPS }],
  duration: [{ key: 'duration', label: MIN_SEC }],
  distance_duration: [
    { key: 'distance', label: DISTANCE_UNIT },
    { key: 'duration', label: MIN_SEC },
  ],
};

const imperial = unitSystem === 'imperial';

/** Range and step of the wheel for each field, in the chosen units. */
export const WHEELS: Record<
  keyof Inputs,
  { min: number; max: number; step: number; format: (v: number) => string }
> = {
  weight: imperial
    ? { min: 0, max: 660, step: 1, format: (v) => formatNumber(v) }
    : { min: 0, max: 300, step: 0.5, format: (v) => formatNumber(v) },
  reps: { min: 0, max: 100, step: 1, format: (v) => String(v) },
  duration: { min: 0, max: 3600, step: 15, format: (v) => formatDuration(v) },
  distance: imperial
    ? { min: 0, max: 30, step: 0.1, format: (v) => formatNumber(v) }
    : { min: 0, max: 50, step: 0.1, format: (v) => formatNumber(v) },
};

export const numeric = (key: keyof Inputs, value: string) =>
  (key === 'duration' ? parseDuration(value) : parseDecimal(value)) ?? 0;
export const display = (key: keyof Inputs, n: number) =>
  key === 'duration' ? formatDuration(n) : formatNumber(n);

/** What the set sheet edits: one set's values and where to save them. */
export type SetEdit = {
  id: number;
  title: string;
  type: TrackingType;
  inputs: Inputs;
  onSave: (inputs: Inputs) => void;
};

/**
 * One editable set. The values show as compact pills, so the screen scrolls
 * freely past them; tapping the row hands the set to `onEdit`, which opens the
 * screen's `SetSheet`, and swiping it left deletes it. Ticking it off saves the
 * values again with the toggle.
 */
export function SetRow({
  index,
  set,
  type,
  showCheck,
  locked = false,
  isPR,
  onEdit,
  onSave,
  onToggle,
  onDelete,
}: {
  index: number;
  set: WorkoutSet;
  type: TrackingType;
  showCheck: boolean;
  /** Disables ticking sets off, e.g. while the workout is paused. */
  locked?: boolean;
  isPR: boolean;
  onEdit: (edit: SetEdit) => void;
  onSave: (values: SetValues) => void;
  onToggle: (values: SetValues) => void;
  onDelete: () => void;
}) {
  const [inputs, setInputs] = useState(() => toInputs(set));
  const done = set.completedAt !== null;

  const edit = () =>
    onEdit({
      id: set.id,
      title: `${t`Підхід`} ${index + 1}`,
      type,
      inputs,
      onSave: (next) => {
        setInputs(next);
        onSave(toValues(next));
      },
    });

  return (
    <SwipeToDelete onDelete={onDelete}>
      <Pressable
        onPress={edit}
        style={({ pressed }) => [
          styles.row,
          done && showCheck && styles.rowDone,
          pressed && styles.pressed,
        ]}>
        <View style={styles.index}>
          <Text variant="caption">{index + 1}</Text>
          {/* Pinned to the number so a record doesn't narrow this row's fields. */}
          {isPR && (
            <View style={styles.pr}>
              <Ionicons name="trophy" size={10} color={colors.accentText} />
            </View>
          )}
        </View>
        <View style={styles.fields}>
          {FIELDS[type].map((f) => {
            const value = numeric(f.key, inputs[f.key]);
            return (
              <View key={f.key} style={styles.pill}>
                <Text variant="title" style={[styles.value, value === 0 && styles.valueEmpty]}>
                  {WHEELS[f.key].format(value)}
                </Text>
                <Text variant="caption" style={styles.unit}>
                  {f.label}
                </Text>
              </View>
            );
          })}
        </View>
        {showCheck ? (
          <Pressable
            onPress={() => onToggle(toValues(inputs))}
            disabled={locked}
            hitSlop={6}
            style={[styles.check, done && styles.checkDone, locked && styles.locked]}>
            <Ionicons
              name="checkmark"
              size={22}
              color={done ? colors.accentText : colors.textMuted}
            />
          </Pressable>
        ) : (
          <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
        )}
      </Pressable>
    </SwipeToDelete>
  );
}

/**
 * Bottom sheet with a big wheel per field of the set being edited. Done saves
 * the values; closing it any other way (a tap outside, Back, a drag down)
 * drops them. Render it last in the screen, over everything else. Not a
 * `Modal`: edge to edge on Android, a modal cuts off whatever reaches the
 * bottom of the screen.
 */
export function SetSheet({ edit, onClose }: { edit: SetEdit | null; onClose: () => void }) {
  useEffect(() => {
    if (!edit) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [edit, onClose]);

  return edit ? <SheetBody key={edit.id} edit={edit} onClose={onClose} /> : null;
}

const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };

function SheetBody({ edit, onClose }: { edit: SetEdit; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  // Edited here and handed to the row only on Done.
  const [inputs, setInputs] = useState(edit.inputs);
  const drag = useSharedValue(0);
  const height = useSharedValue(1);

  // Only the strip with the handle and title drags: the wheels below scroll the
  // same way.
  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      // Pulling up only gives a little.
      drag.set(e.translationY > 0 ? e.translationY : e.translationY * 0.2);
    })
    .onEnd((e) => {
      if (e.translationY > height.get() / 3 || e.velocityY > 800) {
        drag.set(
          withTiming(height.get(), { duration: 180 }, (finished) => {
            if (finished) scheduleOnRN(onClose);
          }),
        );
      } else {
        drag.set(withSpring(0, SPRING));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.get(), [0, height.get()], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={styles.overlay}>
      <Animated.View style={[styles.dim, dimStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(240)}>
        <Animated.View
          onLayout={(e) => height.set(e.nativeEvent.layout.height)}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <View style={styles.handle} />
              <Text variant="heading" style={styles.sheetTitle}>
                {edit.title}
              </Text>
            </View>
          </GestureDetector>
          <View style={styles.wheels}>
            {FIELDS[edit.type].map((f) => {
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
                  rows={5}
                  onChange={(v) =>
                    setInputs((prev) => ({ ...prev, [f.key]: display(f.key, v) }))
                  }
                />
              );
            })}
          </View>
          <Button
            title={t`Готово`}
            onPress={() => {
              edit.onSave(inputs);
              onClose();
            }}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A raised card, so the whole row reads as one thing to tap.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md + 4,
    backgroundColor: colors.surfaceRaised,
  },
  rowDone: { opacity: 0.9 },
  index: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  // Same look as a wheel's selected row, so the sheet reads as this pill grown.
  pill: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  value: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  valueEmpty: { color: colors.textMuted },
  unit: { position: 'absolute', right: 12, color: colors.textSecondary },
  pr: {
    position: 'absolute',
    top: -5,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  checkDone: { backgroundColor: colors.accent },
  locked: { opacity: 0.35 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 10,
    borderTopRightRadius: radius.lg + 10,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  grab: { paddingTop: spacing.sm, gap: spacing.lg },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sheetTitle: { textAlign: 'center' },
  wheels: { flexDirection: 'row', gap: spacing.sm },
});
