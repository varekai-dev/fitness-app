import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import type { Targets, TrackingType } from '@/db/schema';
import { selectOnFocus } from '@/hooks/select-on-focus';
import { tr } from '@/lib/i18n';
import { formatDistance, parseDecimal } from '@/lib/metrics';
import { DISTANCE_UNIT, displayToKm } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

const str = (v: number | null) => (v === null ? '' : String(v));
const int = (s: string) => {
  const n = parseDecimal(s);
  return n === null ? null : Math.round(n);
};

/** Inline editor for a program day exercise's targets. Saves when a field loses focus. */
export function TargetsEditor({
  type,
  targets,
  onSave,
}: {
  type: TrackingType;
  targets: Targets;
  onSave: (targets: Targets) => void;
}) {
  const [sets, setSets] = useState(str(targets.targetSets));
  const [repsMin, setRepsMin] = useState(str(targets.targetRepsMin));
  const [repsMax, setRepsMax] = useState(str(targets.targetRepsMax));
  const [duration, setDuration] = useState(str(targets.targetDurationSec));
  const [distance, setDistance] = useState(
    targets.targetDistanceKm === null ? '' : formatDistance(targets.targetDistanceKm),
  );
  const [rest, setRest] = useState(str(targets.restSec));

  const save = () => {
    const min = int(repsMin);
    const max = int(repsMax);
    const km = parseDecimal(distance);
    const next: Targets = {
      targetSets: Math.max(int(sets) ?? 1, 1),
      targetRepsMin: min !== null && max !== null ? Math.min(min, max) : min,
      targetRepsMax: min !== null && max !== null ? Math.max(min, max) : max,
      targetDurationSec: int(duration),
      targetDistanceKm: km === null ? null : displayToKm(km),
      restSec: int(rest) ?? 0,
    };
    setSets(str(next.targetSets));
    setRepsMin(str(next.targetRepsMin));
    setRepsMax(str(next.targetRepsMax));
    setRest(str(next.restSec));
    onSave(next);
  };

  const hasReps = type === 'weight_reps' || type === 'weighted_reps' || type === 'reps';

  return (
    <View style={styles.row}>
      <Cell label={tr('Підходи', 'Sets')} value={sets} onChange={setSets} onSave={save} />
      {hasReps && (
        <>
          <Cell
            label={tr('Повт. від', 'Reps from')}
            value={repsMin}
            onChange={setRepsMin}
            onSave={save}
          />
          <Cell label={tr('до', 'to')} value={repsMax} onChange={setRepsMax} onSave={save} />
        </>
      )}
      {type === 'duration' && (
        <Cell
          label={tr('Час, с', 'Time, s')}
          value={duration}
          onChange={setDuration}
          onSave={save}
        />
      )}
      {type === 'distance_duration' && (
        <Cell
          label={DISTANCE_UNIT.charAt(0).toUpperCase() + DISTANCE_UNIT.slice(1)}
          value={distance}
          onChange={setDistance}
          onSave={save}
          decimal
        />
      )}
      <Cell label={tr('Відпоч., с', 'Rest, s')} value={rest} onChange={setRest} onSave={save} />
    </View>
  );
}

function Cell({
  label,
  value,
  onChange,
  onSave,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  decimal?: boolean;
}) {
  const input = useRef<TextInput>(null);
  return (
    <View style={styles.cell}>
      <TextInput
        ref={input}
        value={value}
        onFocus={() => selectOnFocus(input, value)}
        onChangeText={onChange}
        onEndEditing={onSave}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Text variant="muted" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  input: {
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 2,
  },
  label: { fontSize: 10 },
});
