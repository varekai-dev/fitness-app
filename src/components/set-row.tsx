import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import type { TrackingType, WorkoutSet } from '@/db/schema';
import type { SetValues } from '@/lib/metrics';
import { formatDuration, formatNumber, parseDecimal, parseDuration } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

type Inputs = { weight: string; reps: string; duration: string; distance: string };

const toInputs = (s: SetValues): Inputs => ({
  weight: s.weightKg === null ? '' : formatNumber(s.weightKg),
  reps: s.reps === null ? '' : String(s.reps),
  duration: s.durationSec === null ? '' : formatDuration(s.durationSec),
  distance: s.distanceKm === null ? '' : formatNumber(s.distanceKm),
});

const toValues = (i: Inputs): SetValues => {
  const reps = parseDecimal(i.reps);
  return {
    weightKg: parseDecimal(i.weight),
    reps: reps === null ? null : Math.round(reps),
    durationSec: parseDuration(i.duration),
    distanceKm: parseDecimal(i.distance),
  };
};

const FIELDS: Record<TrackingType, { key: keyof Inputs; label: string; decimal?: boolean; time?: boolean }[]> = {
  weight_reps: [
    { key: 'weight', label: 'кг', decimal: true },
    { key: 'reps', label: 'повт' },
  ],
  weighted_reps: [
    { key: 'weight', label: '+кг', decimal: true },
    { key: 'reps', label: 'повт' },
  ],
  reps: [{ key: 'reps', label: 'повт' }],
  duration: [{ key: 'duration', label: 'хв:с', time: true }],
  distance_duration: [
    { key: 'distance', label: 'км', decimal: true },
    { key: 'duration', label: 'хв:с', time: true },
  ],
};

/**
 * One editable set. Values are saved on blur and again when ticked off,
 * so a tap on ✓ while the keyboard is still open doesn't lose the last edit.
 */
export function SetRow({
  index,
  set,
  type,
  showCheck,
  isPR,
  onSave,
  onToggle,
  onDelete,
}: {
  index: number;
  set: WorkoutSet;
  type: TrackingType;
  showCheck: boolean;
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
      </Pressable>
      {FIELDS[type].map((f) => (
        <View key={f.key} style={styles.cell}>
          <TextInput
            value={inputs[f.key]}
            onChangeText={(v) => setInputs((prev) => ({ ...prev, [f.key]: v }))}
            onEndEditing={() => onSave(toValues(inputs))}
            keyboardType={f.decimal ? 'decimal-pad' : f.time ? 'numbers-and-punctuation' : 'number-pad'}
            selectTextOnFocus
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text variant="muted">{f.label}</Text>
        </View>
      ))}
      {isPR && <Ionicons name="trophy" size={16} color={colors.warning} />}
      {showCheck ? (
        <Pressable
          onPress={() => onToggle(toValues(inputs))}
          hitSlop={6}
          style={[styles.check, done && styles.checkDone]}>
          <Ionicons name="checkmark" size={20} color={done ? colors.accentText : colors.textMuted} />
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
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  rowDone: { backgroundColor: 'rgba(74, 222, 128, 0.08)' },
  index: { width: 22, alignItems: 'center' },
  cell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  check: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  checkDone: { backgroundColor: colors.accent },
});
