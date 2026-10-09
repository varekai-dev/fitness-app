import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, Row } from '@/components/ui';
import type { Targets, TrackingType } from '@/db/schema';
import { parseDecimal } from '@/lib/metrics';
import { spacing } from '@/theme';

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
  const [distance, setDistance] = useState(str(targets.targetDistanceKm));
  const [rest, setRest] = useState(str(targets.restSec));

  const save = () => {
    const min = int(repsMin);
    const max = int(repsMax);
    const next: Targets = {
      targetSets: Math.max(int(sets) ?? 1, 1),
      targetRepsMin: min !== null && max !== null ? Math.min(min, max) : min,
      targetRepsMax: min !== null && max !== null ? Math.max(min, max) : max,
      targetDurationSec: int(duration),
      targetDistanceKm: parseDecimal(distance),
      restSec: int(rest) ?? 0,
    };
    setSets(str(next.targetSets));
    setRepsMin(str(next.targetRepsMin));
    setRepsMax(str(next.targetRepsMax));
    setRest(str(next.restSec));
    onSave(next);
  };

  const num = { keyboardType: 'number-pad' as const, onEndEditing: save, selectTextOnFocus: true };
  const hasReps = type === 'weight_reps' || type === 'weighted_reps' || type === 'reps';

  return (
    <View style={styles.container}>
      <Row style={styles.row}>
        <Field label="Підходи" value={sets} onChangeText={setSets} containerStyle={styles.cell} {...num} />
        {hasReps && (
          <>
            <Field label="Повт. від" value={repsMin} onChangeText={setRepsMin} containerStyle={styles.cell} {...num} />
            <Field label="до" value={repsMax} onChangeText={setRepsMax} containerStyle={styles.cell} {...num} />
          </>
        )}
        {type === 'duration' && (
          <Field label="Час, с" value={duration} onChangeText={setDuration} containerStyle={styles.cell} {...num} />
        )}
        {type === 'distance_duration' && (
          <Field
            label="Км"
            value={distance}
            onChangeText={setDistance}
            containerStyle={styles.cell}
            {...num}
            keyboardType="decimal-pad"
          />
        )}
        <Field label="Відпочинок, с" value={rest} onChangeText={setRest} containerStyle={styles.cellWide} {...num} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { alignItems: 'flex-end' },
  cell: { flex: 1 },
  cellWide: { flex: 1.5 },
});
