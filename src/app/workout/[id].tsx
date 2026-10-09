import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Elapsed } from '@/components/elapsed';
import { SetRow } from '@/components/set-row';
import { Button, Card, EmptyState, IconButton, Loading, Row, Text } from '@/components/ui';
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
import { colors, spacing } from '@/theme';

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
      return { last, record: recordBefore(progress, we.exercise.trackingType, workout.startedAt) };
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
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="alert-circle" title="Тренування не знайдено" />
      </View>
    );
  }

  const { workout, extras } = data;
  const active = workout.finishedAt === null;

  const finish = () => {
    const pending = workout.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.completedAt === null).length,
      0,
    );
    const doFinish = () => {
      timer.stop();
      finishWorkout(workout.id);
      router.back();
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
            router.back();
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: workout.dayName,
          headerLeft: () => <IconButton icon="chevron-down" color={colors.text} onPress={() => router.back()} />,
          headerRight: () =>
            active ? (
              <Button title="Завершити" variant="ghost" onPress={finish} />
            ) : (
              <IconButton icon="trash-outline" color={colors.danger} onPress={remove} />
            ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">
        <Row style={styles.meta}>
          <Text variant="caption">{workout.programName}</Text>
          <Text variant="caption">·</Text>
          {active ? <Elapsed since={workout.startedAt} /> : <Text variant="caption">{formatDate(workout.startedAt)} · {formatDuration((workout.finishedAt! - workout.startedAt) / 1000)}</Text>}
        </Row>

        {workout.exercises.map((we, i) => (
          <ExerciseBlock
            key={we.id}
            we={we}
            active={active}
            last={extras[i].last}
            record={extras[i].record}
            onSetDone={() => timer.start(we.restSec, we.exercise.name)}
          />
        ))}

        {active ? (
          <>
            <Button title="Завершити тренування" icon="flag" onPress={finish} />
            <Button title="Скасувати тренування" variant="danger" onPress={remove} />
          </>
        ) : (
          <Text variant="muted" style={styles.hint}>
            Довге натискання на номер підходу — видалити його.
          </Text>
        )}
      </ScrollView>

      {timer.running && (
        <View style={[styles.timer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.flex}>
            <Text variant="caption">Відпочинок · {timer.label}</Text>
            <Text variant="title">{formatDuration(timer.remainingSec)}</Text>
          </View>
          <Pressable style={styles.timerButton} onPress={() => timer.extend(15)}>
            <Text variant="body">+15 с</Text>
          </Pressable>
          <Pressable style={styles.timerButton} onPress={timer.stop}>
            <Ionicons name="play-skip-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function ExerciseBlock({
  we,
  active,
  last,
  record,
  onSetDone,
}: {
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

  return (
    <Card>
      <Text variant="heading">{we.exercise.name}</Text>
      <Text variant="caption">Ціль: {formatTargets(we)}</Text>
      <Text variant="muted">
        {last ? `Минулого разу: ${last.sets.map((s) => formatSet(type, s)).join(', ')}` : 'Минулого разу: —'}
      </Text>
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
      <Button title="Додати підхід" icon="add" variant="ghost" onPress={() => addSet(we.id, !active)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  meta: { gap: spacing.xs },
  hint: { textAlign: 'center' },
  flex: { flex: 1 },
  timer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  timerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
});
