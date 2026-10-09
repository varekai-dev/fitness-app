import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Elapsed } from '@/components/elapsed';
import { RestTimerCard } from '@/components/rest-timer-card';
import { SetRow } from '@/components/set-row';
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
import type { Targets } from '@/db/schema';
import {
  addSet,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getExerciseHistory,
  getLastSets,
  getWorkout,
  setCompleted,
  updateSet,
  type WorkoutDetail,
} from '@/db/workouts';
import { useDbQuery } from '@/hooks/use-db-query';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { formatDate } from '@/lib/labels';
import { formatDuration, formatSet, isBetter, setMetric } from '@/lib/metrics';
import { computeProgress, recordBefore } from '@/lib/progress';
import { colors, fontSize, radius, spacing } from '@/theme';

async function loadWorkout(id: number) {
  const workout = await getWorkout(id);
  if (!workout) return null;
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
  return { workout, extras };
}

function formatTargets(t: Targets) {
  let what = '';
  if (t.targetRepsMin !== null || t.targetRepsMax !== null) {
    what =
      t.targetRepsMin !== null && t.targetRepsMax !== null && t.targetRepsMin !== t.targetRepsMax
        ? `${t.targetRepsMin}–${t.targetRepsMax}`
        : String(t.targetRepsMin ?? t.targetRepsMax);
  } else if (t.targetDurationSec !== null) what = formatDuration(t.targetDurationSec);
  else if (t.targetDistanceKm !== null) what = `${t.targetDistanceKm} км`;
  const sets = what ? `${t.targetSets} × ${what}` : `${t.targetSets} підх.`;
  return t.restSec > 0 ? `${sets} · відпочинок ${formatDuration(t.restSec)}` : sets;
}

export default function WorkoutScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data } = useDbQuery(() => loadWorkout(id), [id]);
  const timer = useRestTimer();
  const insets = useSafeAreaInsets();

  if (data === undefined) return <Loading />;
  if (data === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Тренування" />
        <EmptyState icon="alert-circle" title="Тренування не знайдено" />
      </View>
    );
  }

  const { workout, extras } = data;
  const active = workout.finishedAt === null;
  const allSets = workout.exercises.flatMap((e) => e.sets);
  const doneSets = allSets.filter((s) => s.completedAt !== null).length;

  const finish = () => {
    const pending = allSets.length - doneSets;
    const doFinish = () => {
      timer.stop();
      finishWorkout(workout.id);
      goBack();
    };
    if (pending === 0) return doFinish();
    Alert.alert('Завершити тренування?', `Невідмічені підходи (${pending}) не збережуться.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Завершити', onPress: doFinish },
    ]);
  };

  const remove = () =>
    Alert.alert(
      active ? 'Скасувати тренування?' : 'Видалити тренування?',
      'Усі записані підходи буде видалено.',
      [
        { text: 'Ні', style: 'cancel' },
        {
          text: active ? 'Скасувати тренування' : 'Видалити',
          style: 'destructive',
          onPress: async () => {
            timer.stop();
            await deleteWorkout(workout.id);
            goBack();
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={active ? 'Активне тренування' : 'Тренування'}
        right={
          active ? (
            <Button title="Завершити" small onPress={finish} />
          ) : (
            <Button title="Видалити" small variant="danger" onPress={remove} />
          )
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (timer.running ? 280 : 48) },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
          <Text variant="overline">{workout.programName}</Text>
          <Text variant="title">{workout.dayName}</Text>
          {!active && <Text variant="caption">{formatDate(workout.startedAt)}</Text>}
        </View>

        <Row style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="muted" style={styles.statLabel}>
              {active ? 'МИНУЛО' : 'ТРИВАЛІСТЬ'}
            </Text>
            {active ? (
              <Elapsed since={workout.startedAt} style={styles.statValue} />
            ) : (
              <Text variant="heading" style={styles.statValue}>
                {formatDuration((workout.finishedAt! - workout.startedAt) / 1000)}
              </Text>
            )}
          </View>
          <View style={styles.stat}>
            <Text variant="muted" style={styles.statLabel}>
              ПІДХОДИ
            </Text>
            <Text variant="heading" style={[styles.statValue, styles.accent]}>
              {active ? `${doneSets} / ${allSets.length}` : String(doneSets)}
            </Text>
          </View>
        </Row>
        {active && allSets.length > 0 && (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${(doneSets / allSets.length) * 100}%` }]}
            />
          </View>
        )}

        {workout.exercises.map((we, i) => (
          <ExerciseBlock
            key={we.id}
            index={i}
            we={we}
            active={active}
            last={extras[i].last}
            record={extras[i].record}
            onSetDone={() => timer.start(we.restSec, we.exercise.name)}
          />
        ))}

        {active ? (
          <>
            <Button title="Завершити тренування" trailingIcon="arrow-forward" onPress={finish} />
            <Button title="Скасувати тренування" variant="ghost" onPress={remove} />
          </>
        ) : (
          <Text variant="muted" style={styles.hint}>
            Довге натискання на номер підходу — видалити його.
          </Text>
        )}
      </ScrollView>

      {timer.running && (
        <RestTimerCard
          remainingSec={timer.remainingSec}
          totalSec={timer.totalSec}
          label={timer.label}
          bottomInset={insets.bottom}
          onExtend={() => timer.extend(15)}
          onSkip={timer.stop}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function ExerciseBlock({
  index,
  we,
  active,
  last,
  record,
  onSetDone,
}: {
  index: number;
  we: WorkoutDetail['exercises'][number];
  active: boolean;
  last: Awaited<ReturnType<typeof getLastSets>>;
  record: number | null;
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

  return (
    <Card style={[styles.exercise, active && allDone && styles.exerciseDone]}>
      <Row>
        <IndexMarker n={index + 1} />
        <View style={styles.flex}>
          <Text variant="heading" numberOfLines={2}>
            {we.exercise.name}
          </Text>
          <Text variant="muted">{formatTargets(we)}</Text>
        </View>
        {active && allDone && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
      </Row>
      <View style={styles.last}>
        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
        <Text variant="muted" style={styles.flex} numberOfLines={2}>
          {last
            ? `Минулого разу: ${last.sets.map((s) => formatSet(type, s)).join(', ')}`
            : 'Минулого разу: —'}
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
        title="Додати підхід"
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
