import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { Wheel } from '@/components/wheel';
import type { TrackingType, WorkoutSet } from '@/db/schema';
import { tr } from '@/lib/i18n';
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
import { colors, radius, spacing } from '@/theme';

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

const REPS = tr('повт', 'reps');
const MIN_SEC = tr('хв:с', 'm:s');

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

/**
 * One editable set: a wheel per field, like in the player, saved as soon as a
 * wheel settles. Ticking it off saves the values again with the toggle.
 */
export function SetRow({
  index,
  set,
  type,
  showCheck,
  locked = false,
  isPR,
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
  onSave: (values: SetValues) => void;
  onToggle: (values: SetValues) => void;
  onDelete: () => void;
}) {
  const [inputs, setInputs] = useState(() => toInputs(set));
  const done = set.completedAt !== null;

  return (
    <View style={[styles.row, done && showCheck && styles.rowDone]}>
      <Pressable onLongPress={onDelete} hitSlop={6} style={styles.index}>
        <Text variant="caption">{index + 1}</Text>
        {/* Pinned to the number so a record doesn't narrow this row's fields. */}
        {isPR && (
          <View style={styles.pr}>
            <Ionicons name="trophy" size={10} color={colors.accentText} />
          </View>
        )}
      </Pressable>
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
              onChange={(v) => {
                const next = { ...inputs, [f.key]: display(f.key, v) };
                setInputs(next);
                onSave(toValues(next));
              }}
            />
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
        <Pressable onPress={onDelete} hitSlop={6} style={styles.check}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowDone: { opacity: 0.9 },
  index: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: { flex: 1, flexDirection: 'row', gap: spacing.sm },
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
});
