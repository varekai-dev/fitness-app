import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
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
import { PlayerSetEditor } from '@/components/player-set-editor';
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
import { formatDuration, formatSet, isBetter, setMetric, type SetValues } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

type WorkoutExercise = WorkoutDetail['exercises'][number];
type Extra = { last: Awaited<ReturnType<typeof getLastSets>>; record: number | null };

const isDone = (we: WorkoutExercise) => we.sets.every((s) => s.completedAt !== null);

/** First exercise at or after `from` (wrapping) that still has sets to do. */
function nextIncomplete(exercises: WorkoutExercise[], from: number) {
  for (let k = 0; k < exercises.length; k++) {
    const i = (from + k) % exercises.length;
    if (!isDone(exercises[i])) return i;
  }
  return null;
}

/**
 * Active workout as a "player": the current exercise's photo on top and an orange
 * card that walks through sets one by one — enter what you did, tap "next set",
 * rest with a countdown, repeat. Remaining exercises are queued below.
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
  const workoutDone = allSets.length > 0 && doneSets === allSets.length;

  const finish = () => {
    const pending = allSets.length - doneSets;
    const doFinish = () => {
      timer.stop();
      finishWorkout(workout.id);
      goBack();
    };
    Alert.alert(
      'Завершити тренування?',
      pending > 0 ? `Невиконані підходи (${pending}) не збережуться.` : 'Усі підходи виконано.',
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
  const currentSet = current.sets.find((s) => s.completedAt === null) ?? null;
  const setNumber = currentSet ? current.sets.indexOf(currentSet) + 1 : current.sets.length;

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

  const goToNextExercise = () => {
    timer.stop();
    if (exercises.length < 2) return;
    const nextIdx = nextIncomplete(exercises, index + 1);
    setCurrentId(exercises[nextIdx ?? (index + 1) % exercises.length].id);
  };

  const completeSet = async (values: SetValues) => {
    if (!currentSet) return;
    await updateSet(currentSet.id, values);
    await setCompleted(currentSet.id, true);

    const remainingHere = current.sets.filter(
      (s) => s.completedAt === null && s.id !== currentSet.id,
    );
    const remainingAll = allSets.filter((s) => s.completedAt === null && s.id !== currentSet.id);
    if (remainingAll.length === 0) {
      timer.stop();
      return;
    }

    let upNext = current;
    if (remainingHere.length === 0) {
      // Exercise finished: move to the next one that still has work left.
      const after = exercises.map((e) =>
        e.id === current.id ? { ...e, sets: e.sets.map((s) => ({ ...s, completedAt: 1 })) } : e,
      );
      const nextIdx = nextIncomplete(after, index + 1);
      if (nextIdx !== null) {
        upNext = exercises[nextIdx];
        setCurrentId(upNext.id);
      }
    }
    timer.start(current.restSec, upNext.exercise.name);
  };

  const undoSet = (setId: number, label: string) =>
    Alert.alert('Повернути підхід?', `${label} — знову стане невиконаним.`, [
      { text: 'Ні', style: 'cancel' },
      { text: 'Повернути', onPress: () => setCompleted(setId, false) },
    ]);

  // Queue: everything after the current exercise, then wrap to the ones before it.
  const queue = [...exercises.slice(index + 1), ...exercises.slice(0, index)];
  const resting = timer.running && !workoutDone;
  const progress = resting
    ? timer.totalSec > 0
      ? 1 - timer.remainingSec / timer.totalSec
      : 0
    : allSets.length > 0
      ? doneSets / allSets.length
      : 0;

  let body: ReactNode;
  if (resting) {
    body = (
      <>
        <Text variant="caption" style={styles.overline}>
          {paused ? 'НА ПАУЗІ · ' : ''}Відпочинок
        </Text>
        <Text variant="hero" style={styles.countdown}>
          {formatDuration(timer.remainingSec)}
        </Text>
        <Text variant="caption" style={styles.subtle} numberOfLines={1}>
          Далі: {current.exercise.name} · підхід {setNumber} з {current.sets.length}
        </Text>
        <Track progress={progress} />
        <View style={styles.actions}>
          <PillButton label="+15 с" onPress={() => timer.extend(15)} />
          <PillButton label="Пропустити" icon="play-skip-forward" primary onPress={timer.stop} />
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Text variant="caption" style={styles.overline}>
          {paused ? 'НА ПАУЗІ · ' : ''}
          {currentSet ? `Підхід ${setNumber} з ${current.sets.length}` : 'Вправу виконано'} · Вправа{' '}
          {index + 1} з {exercises.length}
        </Text>
        <Text variant="title" style={styles.title} numberOfLines={2}>
          {current.exercise.name}
        </Text>
        <Text variant="caption" style={styles.subtle} numberOfLines={2}>
          Ціль: {formatTargets(current)}
          {extra.last
            ? `\nМинулого разу: ${extra.last.sets.map((s) => formatSet(type, s)).join(', ')}`
            : ''}
        </Text>

        {current.sets.length > 0 && (
          <View style={styles.chips}>
            {current.sets.map((s, i) => {
              const done = s.completedAt !== null;
              const isCurrent = s.id === currentSet?.id;
              return (
                <Pressable
                  key={s.id}
                  disabled={!done}
                  onPress={() => undoSet(s.id, `Підхід ${i + 1}: ${formatSet(type, s)}`)}
                  style={[styles.chip, done && styles.chipDone, isCurrent && styles.chipCurrent]}>
                  {s.id === prSetId && <Ionicons name="trophy" size={11} color={colors.accent} />}
                  <Text
                    variant="caption"
                    style={[styles.chipText, done && styles.chipTextDone]}
                    numberOfLines={1}>
                    {done ? formatSet(type, s) : `${i + 1}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {currentSet ? (
          <PlayerSetEditor
            key={currentSet.id}
            set={currentSet}
            type={type}
            locked={paused}
            onCompleteSet={completeSet}
            onNextExercise={goToNextExercise}
            canNextExercise={exercises.length > 1}
          />
        ) : workoutDone ? (
          <View style={styles.actions}>
            <PillButton label="Ще підхід" icon="add" onPress={() => addSet(current.id, false)} />
            <PillButton label="Завершити" icon="flag" primary onPress={finish} />
          </View>
        ) : (
          <View style={styles.actions}>
            <PillButton label="Ще підхід" icon="add" onPress={() => addSet(current.id, false)} />
            <PillButton
              label="Наступна вправа"
              icon="play-forward"
              primary
              onPress={goToNextExercise}
            />
          </View>
        )}
        <Track progress={progress} />
        <Row style={styles.trackLabels}>
          <Elapsed workout={workout} style={styles.subtle} />
          <Text variant="caption" style={styles.subtle}>
            {doneSets} / {allSets.length} підх.
          </Text>
        </Row>
      </>
    );
  }

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
              <Ionicons name="barbell" size={110} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.player}>
            <View style={styles.cardIcons}>
              <CardIcon icon={paused ? 'play' : 'pause'} onPress={togglePause} />
              <CardIcon icon="stop" onPress={finish} />
            </View>
            {body}
          </View>

          {queue.length > 0 && <SectionHeader title="Далі" />}
          {queue.map((we) => {
            const done = isDone(we);
            return (
              <Pressable
                key={we.id}
                onPress={() => {
                  timer.stop();
                  setCurrentId(we.id);
                }}
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

function Track({ progress }: { progress: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.trackFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
    </View>
  );
}

function CardIcon({ icon, onPress }: { icon: 'play' | 'pause' | 'stop'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.cardIcon, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={colors.accentText} />
    </Pressable>
  );
}

function PillButton({
  label,
  icon,
  primary,
  onPress,
}: {
  label: string;
  icon?: 'add' | 'flag' | 'play-forward' | 'play-skip-forward';
  primary?: boolean;
  onPress: () => void;
}) {
  const color = primary ? colors.accent : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillSecondary,
        pressed && styles.pressed,
      ]}>
      <Text variant="body" style={[styles.pillText, { color }]}>
        {label}
      </Text>
      {icon && <Ionicons name={icon} size={16} color={color} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  pressed: { opacity: 0.75 },
  emptyActions: { padding: spacing.lg, gap: spacing.sm },
  hero: { height: 300, backgroundColor: colors.surface },
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
  cardIcons: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    zIndex: 1,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', paddingRight: 84 },
  title: { color: colors.accentText, paddingRight: 8 },
  countdown: { color: colors.accentText, fontSize: 64, marginVertical: spacing.xs },
  subtle: { color: 'rgba(255,255,255,0.8)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 32,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  chipDone: { backgroundColor: colors.text },
  chipCurrent: { borderWidth: 1.5, borderColor: colors.text },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  chipTextDone: { color: colors.accent },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.text, borderRadius: 3 },
  trackLabels: { justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: radius.pill,
  },
  pillPrimary: { backgroundColor: colors.text },
  pillSecondary: { backgroundColor: 'rgba(255,255,255,0.25)' },
  pillText: { fontWeight: '800', fontSize: fontSize.sm },
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
