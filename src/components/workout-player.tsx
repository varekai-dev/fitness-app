import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Elapsed } from '@/components/elapsed';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { SetRow } from '@/components/set-row';
import {
  Button,
  CircleButton,
  EmptyState,
  goBack,
  Row,
  SectionHeader,
  Text,
} from '@/components/ui';
import {
  addSet,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  pauseWorkout,
  resumeWorkout,
  setCompleted,
  updateSet,
  type getLastSets,
  type WorkoutDetail,
} from '@/db/workouts';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { formatTargets } from '@/lib/labels';
import { formatDuration, formatSet, isBetter, setMetric } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

type WorkoutExercise = WorkoutDetail['exercises'][number];
type Extra = { last: Awaited<ReturnType<typeof getLastSets>>; record: number | null };

const isDone = (we: WorkoutExercise) =>
  we.sets.length > 0 && we.sets.every((s) => s.completedAt !== null);

/** First exercise at or after `from` (wrapping) that still has sets to do. */
function nextIncomplete(exercises: WorkoutExercise[], from: number) {
  for (let k = 0; k < exercises.length; k++) {
    const i = (from + k) % exercises.length;
    if (!isDone(exercises[i])) return i;
  }
  return null;
}

/**
 * Active workout as a "player": one current exercise with its photo on top,
 * an orange control card (finish / pause / next), its sets, and the queue below.
 */
export function WorkoutPlayer({ workout, extras }: { workout: WorkoutDetail; extras: Extra[] }) {
  const insets = useSafeAreaInsets();
  const timer = useRestTimer();
  const exercises = workout.exercises;
  const [currentId, setCurrentId] = useState<number | null>(
    () => exercises[nextIncomplete(exercises, 0) ?? 0]?.id ?? null,
  );

  const paused = workout.pausedAt !== null;
  const index = Math.max(
    0,
    exercises.findIndex((e) => e.id === currentId),
  );
  const current = exercises[index];
  const allSets = exercises.flatMap((e) => e.sets);
  const doneSets = allSets.filter((s) => s.completedAt !== null).length;

  const finish = () => {
    const pending = allSets.length - doneSets;
    const doFinish = () => {
      timer.stop();
      finishWorkout(workout.id);
      goBack();
    };
    Alert.alert(
      'Завершити тренування?',
      pending > 0 ? `Невідмічені підходи (${pending}) не збережуться.` : 'Усі підходи виконано.',
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Завершити', onPress: doFinish },
      ],
    );
  };

  const discard = () =>
    Alert.alert('Скасувати тренування?', 'Усі записані підходи буде видалено.', [
      { text: 'Ні', style: 'cancel' },
      {
        text: 'Скасувати тренування',
        style: 'destructive',
        onPress: async () => {
          timer.stop();
          await deleteWorkout(workout.id);
          goBack();
        },
      },
    ]);

  const togglePause = async () => {
    if (paused) {
      resumeWorkout(workout.id);
      timer.resume();
    } else {
      await pauseWorkout(workout.id);
      timer.pause();
    }
  };

  const next = () => {
    if (timer.running) return timer.stop();
    if (exercises.length < 2) return;
    setCurrentId(exercises[(index + 1) % exercises.length].id);
  };

  if (!current) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
        <EmptyState icon="barbell" title="У цьому дні немає вправ" />
        <View style={styles.emptyActions}>
          <Button title="Завершити" onPress={finish} />
          <Button title="Скасувати тренування" variant="ghost" onPress={discard} />
        </View>
      </View>
    );
  }

  const extra = extras[index];
  const type = current.exercise.trackingType;
  // Only the best completed set of this session can be the PR.
  let bestId: number | null = null;
  let best: number | null = null;
  for (const s of current.sets) {
    const m = s.completedAt !== null ? setMetric(type, s) : null;
    if (m !== null && isBetter(type, m, best)) {
      best = m;
      bestId = s.id;
    }
  }
  const prSetId = best !== null && isBetter(type, best, extra.record) ? bestId : null;

  const onToggle = async (setId: number, values: Parameters<typeof updateSet>[1]) => {
    const set = current.sets.find((s) => s.id === setId);
    if (!set) return;
    const completing = set.completedAt === null;
    await updateSet(setId, values);
    await setCompleted(setId, completing);
    if (!completing) return;

    const exerciseDone = current.sets.every((s) => s.id === setId || s.completedAt !== null);
    const workoutDone = allSets.every((s) => s.id === setId || s.completedAt !== null);
    if (workoutDone) {
      timer.stop();
      return;
    }
    timer.start(current.restSec, current.exercise.name);
    if (exerciseDone) {
      // Move on to the next exercise that still has work left.
      const after = exercises.map((e) => (e.id === current.id ? { ...e, sets: [] } : e));
      const nextIdx = nextIncomplete(after, index + 1);
      if (nextIdx !== null) setCurrentId(exercises[nextIdx].id);
    }
  };

  // Queue: everything after the current exercise, then wrap to the ones before it.
  const queue = [...exercises.slice(index + 1), ...exercises.slice(0, index)];
  const resting = timer.running;
  const progress = resting
    ? timer.totalSec > 0
      ? 1 - timer.remainingSec / timer.totalSec
      : 0
    : allSets.length > 0
      ? doneSets / allSets.length
      : 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          {current.exercise.imageUri ? (
            <Image
              source={{ uri: current.exercise.imageUri }}
              style={styles.fill}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <LinearGradient
              colors={[colors.accentGradientEnd, colors.accent, '#3A1608', colors.background]}
              locations={[0, 0.35, 0.8, 1]}
              style={[styles.fill, styles.heroPlaceholder]}>
              <Ionicons name="barbell" size={120} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.player}>
            <Text variant="caption" style={styles.playerOverline}>
              {paused ? 'НА ПАУЗІ · ' : ''}Вправа {index + 1} з {exercises.length} ·{' '}
              {workout.dayName}
            </Text>
            <Text variant="title" style={styles.playerTitle} numberOfLines={2}>
              {current.exercise.name}
            </Text>
            <Text variant="caption" style={styles.playerSubtitle} numberOfLines={2}>
              {current.exercise.notes?.split('\n')[0] || formatTargets(current)}
            </Text>

            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.min(1, progress) * 100}%` }]} />
            </View>
            <Row style={styles.trackLabels}>
              {resting ? (
                <>
                  <Text variant="caption" style={styles.playerSubtitle}>
                    Відпочинок
                  </Text>
                  <Pressable onPress={() => timer.extend(15)} hitSlop={8} style={styles.extend}>
                    <Text variant="caption" style={styles.playerText}>
                      +15 с
                    </Text>
                  </Pressable>
                  <Text variant="caption" style={styles.playerText}>
                    {formatDuration(timer.remainingSec)}
                  </Text>
                </>
              ) : (
                <>
                  <Elapsed workout={workout} style={styles.playerSubtitle} />
                  <Text variant="caption" style={styles.playerSubtitle}>
                    {doneSets} / {allSets.length} підх.
                  </Text>
                </>
              )}
            </Row>

            <Row style={styles.controls}>
              <ControlButton icon="stop" onPress={finish} />
              <Pressable
                onPress={togglePause}
                style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}>
                <Ionicons name={paused ? 'play' : 'pause'} size={30} color={colors.background} />
              </Pressable>
              <ControlButton
                icon="play-forward"
                onPress={next}
                disabled={!resting && exercises.length < 2}
              />
            </Row>
          </View>

          <View style={styles.sets}>
            <View style={styles.last}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text variant="muted" style={styles.flex} numberOfLines={2}>
                {extra.last
                  ? `Минулого разу: ${extra.last.sets.map((s) => formatSet(type, s)).join(', ')}`
                  : 'Минулого разу: —'}
              </Text>
            </View>
            {current.sets.map((s, i) => (
              <SetRow
                key={s.id}
                index={i}
                set={s}
                type={type}
                showCheck
                locked={paused}
                isPR={s.id === prSetId}
                onSave={(values) => updateSet(s.id, values)}
                onToggle={(values) => onToggle(s.id, values)}
                onDelete={() => deleteSet(s.id)}
              />
            ))}
            <Button
              title="Додати підхід"
              icon="add"
              variant="ghost"
              small
              onPress={() => addSet(current.id, false)}
            />
          </View>

          {queue.length > 0 && <SectionHeader title="Далі" />}
          {queue.map((we) => {
            const done = isDone(we);
            return (
              <Pressable
                key={we.id}
                onPress={() => setCurrentId(we.id)}
                style={({ pressed }) => [
                  styles.queueItem,
                  done && styles.queueDone,
                  pressed && styles.pressed,
                ]}>
                <ExerciseThumb uri={we.exercise.imageUri} size={64} />
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={1}>
                    {we.exercise.name}
                  </Text>
                  <Text variant="muted" numberOfLines={1}>
                    {done ? 'Виконано' : formatTargets(we)}
                  </Text>
                </View>
                {done && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </Pressable>
            );
          })}

          <Button title="Скасувати тренування" variant="ghost" onPress={discard} />
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <CircleButton icon="chevron-back" background="rgba(0,0,0,0.35)" onPress={goBack} />
        <View style={styles.clock}>
          <Ionicons
            name={paused ? 'pause' : 'time-outline'}
            size={14}
            color={paused ? colors.accent : colors.text}
          />
          <Elapsed workout={workout} style={styles.clockText} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ControlButton({
  icon,
  onPress,
  disabled,
}: {
  icon: 'stop' | 'play-forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.sideButton,
        (pressed || disabled) && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Ionicons name={icon} size={18} color={colors.accentText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  emptyActions: { padding: spacing.lg, gap: spacing.sm },
  hero: { height: 380, backgroundColor: colors.surface },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  sheet: {
    marginTop: -40,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg + 10,
    borderTopRightRadius: radius.lg + 10,
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  player: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg + 6,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  playerOverline: { color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  playerTitle: { color: colors.accentText },
  playerSubtitle: { color: 'rgba(255,255,255,0.8)' },
  playerText: { color: colors.accentText, fontWeight: '700' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.text, borderRadius: 3 },
  trackLabels: { justifyContent: 'space-between' },
  extend: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  controls: { justifyContent: 'center', gap: spacing.xl, marginTop: spacing.md },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButton: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sets: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  last: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    paddingRight: spacing.lg,
  },
  queueDone: { opacity: 0.55 },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clockText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
});
