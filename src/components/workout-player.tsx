import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Elapsed } from '@/components/elapsed';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { PlayerSetEditor, Transport } from '@/components/player-set-editor';
import { PlayerSheet, SheetItem } from '@/components/player-sheet';
import { YoutubePlayer, youtubeVideoId } from '@/components/youtube-player';
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
import { exerciseImageSource } from '@/lib/exercise-images';

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
  const [collapsedHeight, setCollapsedHeight] = useState(420);
  const sheetProgress = useSharedValue(0);
  // Photo drifts up and zooms in slightly as the sheet opens.
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(sheetProgress.get(), [0, 1], [0, -40]) },
      { scale: interpolate(sheetProgress.get(), [0, 1], [1, 1.08]) },
    ],
  }));
  const [currentId, setCurrentId] = useState<number | null>(
    () => exercises[nextIncomplete(exercises, 0) ?? 0]?.id ?? null,
  );
  // Workout exercise whose video replaces the photo; switching exercises closes it.
  const [videoFor, setVideoFor] = useState<number | null>(null);

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
  const youtubeUrl = current.exercise.youtubeUrl;
  const videoId = youtubeVideoId(youtubeUrl);
  const showVideo = videoId !== null && videoFor === current.id;
  // Search links and other pages can't be embedded, so they open in the browser.
  const toggleVideo = () => {
    if (!videoId) WebBrowser.openBrowserAsync(youtubeUrl!);
    else setVideoFor(showVideo ? null : current.id);
  };
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

  // Back steps through history: reopen this exercise's latest set, or once none is
  // done here, return to the exercise worked on before (else the one above).
  const lastDoneHere = current.sets
    .filter((s) => s.completedAt !== null)
    .reduce<(typeof current.sets)[number] | null>(
      (a, s) => (a && a.completedAt! > s.completedAt! ? a : s),
      null,
    );
  let prevExerciseId: number | null = index > 0 ? exercises[index - 1].id : null;
  let latest = 0;
  for (const e of exercises) {
    if (e.id === current.id) continue;
    for (const s of e.sets) {
      if (s.completedAt !== null && s.completedAt > latest) {
        latest = s.completedAt;
        prevExerciseId = e.id;
      }
    }
  }
  const goBackStep = () => {
    timer.stop();
    if (lastDoneHere) setCompleted(lastDoneHere.id, false);
    else if (prevExerciseId !== null) setCurrentId(prevExerciseId);
  };
  const back = {
    icon: 'play-skip-back' as const,
    label: lastDoneHere ? 'Попередній підхід' : 'Попередня вправа',
    onPress: goBackStep,
    disabled: !lastDoneHere && prevExerciseId === null,
  };
  const nextExercise = {
    icon: 'play-skip-forward' as const,
    label: 'Наступна вправа',
    onPress: goToNextExercise,
    disabled: exercises.length < 2,
  };
  // Tap pauses or resumes; holding fills a ring, turns into stop and asks to finish.
  const pauseStop = {
    icon: paused ? ('play' as const) : ('pause' as const),
    holdIcon: 'stop' as const,
    label: paused ? 'Продовжити' : 'Пауза',
    onPress: togglePause,
    onHold: finish,
  };
  const transport = (
    <>
      <Transport left={back} main={pauseStop} right={nextExercise} />
      {paused && (
        <Text variant="caption" style={styles.hint}>
          Утримуйте кнопку, щоб завершити тренування
        </Text>
      )}
    </>
  );

  const completeSet = async (values: SetValues) => {
    if (!currentSet) return;
    const remainingHere = current.sets.filter(
      (s) => s.completedAt === null && s.id !== currentSet.id,
    );
    // The next set starts from what was just done, so repeating it is one tap.
    if (remainingHere.length > 0) await updateSet(remainingHere[0].id, values);
    await updateSet(currentSet.id, values);
    await setCompleted(currentSet.id, true);

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

  const progressBar = (
    <>
      <Track progress={progress} />
      <Row style={styles.trackLabels}>
        <Elapsed workout={workout} style={styles.subtle} />
        <Text variant="caption" style={styles.subtle}>
          {doneSets} / {allSets.length} підх.
        </Text>
      </Row>
    </>
  );

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
        {transport}
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
          <PlayerSetEditor key={currentSet.id} set={currentSet} type={type}>
            {(values) => (
              <>
                {progressBar}
                {transport}
                <View style={styles.actions}>
                  <PillButton
                    label="Підхід виконано"
                    icon="checkmark"
                    primary
                    disabled={paused}
                    onPress={() => completeSet(values())}
                  />
                </View>
              </>
            )}
          </PlayerSetEditor>
        ) : (
          <>
            {progressBar}
            {transport}
            <View style={styles.actions}>
              <PillButton label="Ще підхід" icon="add" onPress={() => addSet(current.id, false)} />
              {workoutDone && <PillButton label="Завершити" icon="flag" primary onPress={finish} />}
            </View>
          </>
        )}
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[styles.hero, { bottom: collapsedHeight - 40 }, heroStyle]}>
        {showVideo ? (
          <View style={[styles.fill, styles.videoWrap, { paddingTop: insets.top + 60 }]}>
            <YoutubePlayer videoId={videoId} />
          </View>
        ) : current.exercise.imageUri ? (
          <Image
            source={exerciseImageSource(current.exercise.imageUri)}
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
      </Animated.View>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <CircleButton icon="chevron-back" background="rgba(0,0,0,0.35)" onPress={goBack} />
        <View style={styles.topRight}>
          <View style={styles.clockRow}>
            <View style={styles.clock}>
              <Ionicons
                name={paused ? 'pause' : 'time-outline'}
                size={14}
                color={paused ? colors.accent : colors.text}
              />
              <Elapsed workout={workout} style={styles.clockText} />
            </View>
          </View>
          {youtubeUrl && (
            <CircleButton
              icon={showVideo ? 'image-outline' : 'logo-youtube'}
              background="rgba(0,0,0,0.35)"
              onPress={toggleVideo}
            />
          )}
        </View>
      </View>

      <PlayerSheet
        topInset={insets.top + 64}
        bottomInset={insets.bottom}
        onCollapsedHeight={setCollapsedHeight}
        progress={sheetProgress}
        header={
          <View style={styles.player}>
            {body}
          </View>
        }>
        {queue.length > 0 && (
          <SheetItem progress={sheetProgress} index={0}>
            <SectionHeader title={`Далі · ${queue.length}`} />
          </SheetItem>
        )}
        {queue.map((we, i) => {
          const done = isDone(we);
          return (
            <SheetItem key={we.id} progress={sheetProgress} index={i + 1}>
              <Pressable
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
            </SheetItem>
          );
        })}

        <SheetItem progress={sheetProgress} index={queue.length + 1}>
          <Button title="Скасувати тренування" variant="ghost" onPress={discard} />
        </SheetItem>
      </PlayerSheet>
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

function PillButton({
  label,
  icon,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  icon?: 'add' | 'checkmark' | 'flag' | 'play-skip-forward';
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = primary ? colors.accent : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillSecondary,
        (pressed || disabled) && styles.pressed,
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
  hero: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.surface },
  videoWrap: { backgroundColor: '#000', justifyContent: 'center', paddingBottom: 40 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  player: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg + 6,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  overline: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', marginTop: spacing.xs },
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  // Clock row matches the back button's height so both stay vertically centred.
  topRight: { alignItems: 'flex-end', gap: spacing.sm },
  clockRow: { height: 44, justifyContent: 'center' },
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
