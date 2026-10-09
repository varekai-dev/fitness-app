import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

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
 * Big inputs with −/+ steppers for the set in progress, shown inside the orange
 * player card. Keyed by set id, so it starts from that set's prefilled values.
 */
export function PlayerSetEditor({
  set,
  type,
  locked,
  onCompleteSet,
  onNextExercise,
  canNextExercise,
}: {
  set: WorkoutSet;
  type: TrackingType;
  locked: boolean;
  onCompleteSet: (values: SetValues) => void;
  onNextExercise: () => void;
  canNextExercise: boolean;
}) {
  const [inputs, setInputs] = useState(() => toInputs(set));
  const update = (key: keyof Inputs, value: string) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  return (
    <View style={styles.container}>
      <View style={styles.fields}>
        {FIELDS[type].map((f) => (
          <View key={f.key} style={styles.field}>
            <Pressable
              hitSlop={6}
              style={styles.stepper}
              onPress={() => update(f.key, step(f.key, inputs[f.key], -1))}>
              <Ionicons name="remove" size={18} color={colors.accentText} />
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
                placeholderTextColor="rgba(255,255,255,0.5)"
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
              <Ionicons name="add" size={18} color={colors.accentText} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onNextExercise}
          disabled={!canNextExercise}
          style={({ pressed }) => [
            styles.secondary,
            (pressed || !canNextExercise) && styles.dimmed,
          ]}>
          <Text variant="body" style={styles.secondaryText}>
            Наступна вправа
          </Text>
          <Ionicons name="play-forward" size={16} color={colors.accentText} />
        </Pressable>
        <Pressable
          onPress={() => onCompleteSet(toValues(inputs))}
          disabled={locked}
          style={({ pressed }) => [styles.primary, (pressed || locked) && styles.dimmed]}>
          <Text variant="body" style={styles.primaryText}>
            Наступний підхід
          </Text>
          <Ionicons name="checkmark" size={18} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, marginTop: spacing.md },
  fields: { flexDirection: 'row', gap: spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  stepper: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: { flex: 1, alignItems: 'center' },
  value: {
    alignSelf: 'stretch',
    color: colors.accentText,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 2,
  },
  unit: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: -2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  secondaryText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.sm },
  primary: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  primaryText: { color: colors.accent, fontWeight: '800', fontSize: fontSize.sm },
  dimmed: { opacity: 0.5 },
});
