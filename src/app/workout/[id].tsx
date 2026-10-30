import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDialog } from '@/components/dialog';
import { SetRow, SetSheet, type SetEdit } from '@/components/set-row';
import { WorkoutPlayer } from '@/components/workout-player';
import {
  Button,
  Card,
  EmptyState,
  goBack,
  IndexMarker,
  Loading,
  Row,
  ScreenHeader,
  Text,
} from '@/components/ui';
import {
  addSet,
  deleteSet,
  deleteWorkout,
  getExerciseHistory,
  getLastSets,
  getWorkout,
  setCompleted,
  updateSet,
  type WorkoutDetail,
} from '@/db/workouts';
import { listBodyWeights } from '@/db/body-weight';
import { useDbQuery } from '@/hooks/use-db-query';
import { bodyWeightAt, exerciseKcal, formatKcal, workoutKcal } from '@/lib/calories';
import { formatDate, formatTargets } from '@/lib/labels';
import { formatDuration, formatSet, isBetter, setMetric, workoutDurationMs } from '@/lib/metrics';
import { computeProgress, recordBefore } from '@/lib/progress';
import { colors, fontSize, radius, spacing } from '@/theme';

async function loadWorkout(id: number) {
  const [workout, weights] = await Promise.all([getWorkout(id), listBodyWeights()]);
  if (!workout) return null;
  const bodyKg = bodyWeightAt(weights, workout.startedAt);
  const extras = await Promise.all(
    workout.exercises.map(async (we) => {
      const [last, history] = await Promise.all([
        getLastSets(we.exerciseId, workout.startedAt),
        getExerciseHistory(we.exerciseId),
      ]);
      const progress = computeProgress(we.exercise.trackingType, history);
      return {
        last,
        record: recordBefore(progress, we.exercise.trackingType, workout.startedAt),
      };
    }),
  );
  return { workout, extras, bodyKg };
}

export default function WorkoutScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data } = useDbQuery(() => loadWorkout(id), [id]);

  if (data === undefined) return <Loading />;
  if (data === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t({ message: 'Тренування', context: 'Workout' })} />
        <EmptyState icon="alert-circle" title={t`Тренування не знайдено`} />
      </View>
    );
  }
  if (data.workout.finishedAt === null) {
    return <WorkoutPlayer workout={data.workout} extras={data.extras} bodyKg={data.bodyKg} />;
  }
  return <FinishedWorkout workout={data.workout} extras={data.extras} bodyKg={data.bodyKg} />;
}

/** A past workout: every exercise and set is editable in place. */
function FinishedWorkout({
  workout,
  extras,
  bodyKg,
}: {
  workout: WorkoutDetail;
  extras: NonNullable<Awaited<ReturnType<typeof loadWorkout>>>['extras'];
  bodyKg: number | null;
}) {
  const insets = useSafeAreaInsets();
  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const dialog = useDialog();
  const [edit, setEdit] = useState<SetEdit | null>(null);

  const remove = () =>
    dialog.show({
      title: t`Видалити тренування?`,
      message: t`Усі записані підходи буде видалено.`,
      buttons: [
        { text: t`Ні`, style: 'cancel' },
        {
          text: t`Видалити`,
          style: 'destructive',
          onPress: async () => {
            await deleteWorkout(workout.id);
            goBack();
          },
        },
      ],
    });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={t({ message: 'Тренування', context: 'Workout' })}
        right={<Button title={t`Видалити`} small variant="danger" onPress={remove} />}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
          <Text variant="overline">{workout.programName}</Text>
          <Text variant="title">{workout.dayName}</Text>
          <Text variant="caption">{formatDate(workout.startedAt)}</Text>
        </View>

        <Row style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="muted" style={styles.statLabel}>
              {t`ТРИВАЛІСТЬ`}
            </Text>
            <Text variant="heading" style={styles.statValue}>
              {formatDuration(workoutDurationMs(workout, workout.startedAt) / 1000)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="muted" style={styles.statLabel}>
              {t`ПІДХОДИ`}
            </Text>
            <Text variant="heading" style={[styles.statValue, styles.accent]}>
              {String(doneSets)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="muted" style={styles.statLabel}>
              {t`ККАЛ`}
            </Text>
            <Text variant="heading" style={styles.statValue}>
              {bodyKg !== null ? `~${Math.round(workoutKcal(workout.exercises, bodyKg))}` : '—'}
            </Text>
          </View>
        </Row>
        {bodyKg === null && (
          <Text variant="muted" style={styles.hint}>
            {t`Додай вагу тіла, щоб рахувати калорії.`}
          </Text>
        )}

        {workout.exercises.map((we, i) => (
          <ExerciseBlock
            key={we.id}
            index={i}
            we={we}
            active={false}
            last={extras[i].last}
            record={extras[i].record}
            kcal={
              bodyKg !== null
                ? exerciseKcal(we.exercise.trackingType, we.sets, we.restSec, bodyKg)
                : null
            }
            onEdit={setEdit}
            onSetDone={() => {}}
          />
        ))}

        <Text variant="muted" style={styles.hint}>
          {t`Торкнись підходу, щоб змінити його, або свайпни вліво, щоб видалити.`}
        </Text>
      </ScrollView>
      <SetSheet edit={edit} onClose={() => setEdit(null)} />
      {dialog.element}
    </KeyboardAvoidingView>
  );
}

function ExerciseBlock({
  index,
  we,
  active,
  last,
  record,
  kcal,
  onEdit,
  onSetDone,
}: {
  index: number;
  we: WorkoutDetail['exercises'][number];
  active: boolean;
  last: Awaited<ReturnType<typeof getLastSets>>;
  record: number | null;
  kcal: number | null;
  onEdit: (edit: SetEdit) => void;
  onSetDone: () => void;
}) {
  const type = we.exercise.trackingType;
  // Only the best completed set of this session can be the PR.
  let bestId: number | null = null;
  let best: number | null = null;
  for (const s of we.sets) {
    const m = s.completedAt !== null ? setMetric(type, s) : null;
    if (m !== null && isBetter(type, m, best)) {
      best = m;
      bestId = s.id;
    }
  }
  const prSetId = best !== null && isBetter(type, best, record) ? bestId : null;
  const allDone = we.sets.length > 0 && we.sets.every((s) => s.completedAt !== null);
  // A finished workout keeps only done sets, so an exercise left with none was skipped.
  const skipped = !active && we.sets.length === 0;

  return (
    <Card
      style={[
        styles.exercise,
        active && allDone && styles.exerciseDone,
        skipped && styles.skipped,
      ]}>
      <Row>
        <IndexMarker n={index + 1} />
        <View style={styles.flex}>
          <Text variant="heading" numberOfLines={2}>
            {we.exercise.name}
          </Text>
          <Text variant="muted">
            {formatTargets(we)}
            {kcal ? ` · ${formatKcal(kcal)}` : ''}
          </Text>
        </View>
        {skipped && (
          <View style={styles.skippedBadge}>
            <Ionicons name="play-forward" size={12} color={colors.textSecondary} />
            <Text variant="caption" style={styles.skippedText}>
              {t`Пропущено`}
            </Text>
          </View>
        )}
        {active && allDone && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
      </Row>
      <View style={styles.last}>
        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
        <Text variant="muted" style={styles.flex} numberOfLines={2}>
          {last
            ? `${t`Минулого разу`}: ${last.sets.map((s) => formatSet(type, s)).join(', ')}`
            : `${t`Минулого разу`}: —`}
        </Text>
      </View>
      {we.sets.map((s, i) => (
        <SetRow
          key={s.id}
          index={i}
          set={s}
          type={type}
          showCheck={active}
          isPR={s.id === prSetId}
          onEdit={onEdit}
          onSave={(values) => updateSet(s.id, values)}
          onToggle={async (values) => {
            const completing = s.completedAt === null;
            await updateSet(s.id, values);
            await setCompleted(s.id, completing);
            if (completing) onSetDone();
          }}
          onDelete={() => deleteSet(s.id)}
        />
      ))}
      <Button
        title={t`Додати підхід`}
        icon="add"
        variant="ghost"
        small
        onPress={() => addSet(we.id, !active)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  titleBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  stats: { gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  statLabel: { fontSize: 10, letterSpacing: 0.8 },
  statValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  accent: { color: colors.accent },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  exercise: { gap: spacing.sm },
  exerciseDone: { borderWidth: 1, borderColor: colors.accent },
  skipped: { opacity: 0.6 },
  skippedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  skippedText: { color: colors.textSecondary, fontWeight: '700' },
  last: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  flex: { flex: 1 },
  hint: { textAlign: 'center' },
});
