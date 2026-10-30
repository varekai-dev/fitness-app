import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { usePreventRemove } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDialog } from '@/components/dialog';
import { Elapsed } from '@/components/elapsed';
import { Glass } from '@/components/glass';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { PlayerSetEditor, Transport } from '@/components/player-set-editor';
import { MuscleIcon } from '@/components/muscle-icon';
import { PlayerSheet, SheetItem } from '@/components/player-sheet';
import { RestRing } from '@/components/rest-ring';
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
  dropPendingSets,
  finishWorkout,
  MIN_WORKOUT_MS,
  pauseWorkout,
  resumeWorkout,
  setCompleted,
  updateSet,
  type getLastSets,
  type WorkoutDetail,
} from '@/db/workouts';
import type { TrackingType } from '@/db/schema';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { exerciseKcal, formatKcal, workoutKcal } from '@/lib/calories';
import { formatSetTarget, formatTargets } from '@/lib/labels';
import {
  formatSet,
  formatWeight,
  isBetter,
  notStarted,
  setMetric,
  type SetValues,
  workoutDurationMs,
} from '@/lib/metrics';
import { WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';
import { exerciseImageSource } from '@/lib/exercise-images';

type WorkoutExercise = WorkoutDetail['exercises'][number];
type Extra = { last: Awaited<ReturnType<typeof getLastSets>>; record: number | null };

const isDone = (we: WorkoutExercise) => we.sets.every((s) => s.completedAt !== null);

/** A past set spelled out, so "12 kg · 5 reps" can't be read as 5 sets. */
function formatLastSet(type: TrackingType, s: SetValues) {
  const reps = `${s.reps ?? 0} ${t`повт.`}`;
  switch (type) {
    case 'weight_reps':
      return `${formatWeight(s.weightKg ?? 0)} ${WEIGHT_UNIT} · ${reps}`;
    case 'weighted_reps':
      return s.weightKg ? `+${formatWeight(s.weightKg)} ${WEIGHT_UNIT} · ${reps}` : reps;
    case 'reps':
      return reps;
    default:
      return formatSet(type, s);
  }
}

/** First exercise at or after `from` (wrapping) that still has sets to do. */
function nextIncomplete(exercises: WorkoutExercise[], from: number) {
  for (let k = 0; k < exercises.length; k++) {
    const i = (from + k) % exercises.length;
    if (!isDone(exercises[i])) return i;
  }
  return null;
}

/**
 * Active workout as a "player": the current exercise's photo on top and a
 * card that walks through sets one by one — enter what you did, tap "next set",
 * rest with a countdown, repeat. Remaining exercises are queued below.
 */
export function WorkoutPlayer({
  workout,
  extras,
  bodyKg,
}: {
  workout: WorkoutDetail;
  extras: Extra[];
  /** Null until a body weight is logged; calories are hidden then. */
  bodyKg: number | null;
}) {
  const insets = useSafeAreaInsets();
  const timer = useRestTimer();
  const exercises = workout.exercises;
  const [collapsedHeight, setCollapsedHeight] = useState(420);
  // Natural heights of the exercise and rest views, measured as they render.
  const [bodyHeights, setBodyHeights] = useState({ work: 0, rest: 0 });
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
  const dialog = useDialog();
  // The player is glanced at between sets, so the screen shouldn't lock mid-workout.
  useKeepAwake();

  const paused = workout.pausedAt !== null;
  const waiting = notStarted(workout);
  const pausedTag = waiting ? '' : paused ? t`НА ПАУЗІ · ` : '';
  const index = Math.max(
    0,
    exercises.findIndex((e) => e.id === currentId),
  );
  const current = exercises[index];
  const videoOpen = videoFor !== null && videoFor === current?.id;
  // Back (button, gesture or Android's key) closes the video first instead of leaving
  // the workout; finishing or discarding still leaves.
  const disableRemovalPrevention = usePreventRemove(videoOpen, () => setVideoFor(null));
  const leave = () => {
    setVideoFor(null);
    disableRemovalPrevention();
    goBack();
  };
  const allSets = exercises.flatMap((e) => e.sets);
  const doneSets = allSets.filter((s) => s.completedAt !== null).length;
  const workoutDone = allSets.length > 0 && doneSets === allSets.length;

  const finish = () => {
    const pending = allSets.length - doneSets;
    const doFinish = () => {
      timer.stop();
      finishWorkout(workout.id);
      leave();
    };
    dialog.show({
      title: t`Завершити тренування?`,
      message:
        workoutDurationMs(workout, Date.now()) < MIN_WORKOUT_MS
          ? t`Тренування коротше 30 с не збережеться в історії.`
          : pending > 0
            ? t`Невиконані підходи (${pending}) не збережуться.`
            : t`Усі підходи виконано.`,
      icon: 'flag',
      buttons: [
        { text: t`Скасувати`, style: 'cancel' },
        { text: t`Завершити`, onPress: doFinish },
      ],
    });
  };

  const discard = () =>
    dialog.show({
      title: t`Скасувати тренування?`,
      message: t`Усі записані підходи буде видалено.`,
      buttons: [
        { text: t`Ні`, style: 'cancel' },
        {
          text: t({ message: 'Скасувати', context: 'Discard' }),
          style: 'destructive',
          onPress: async () => {
            timer.stop();
            await deleteWorkout(workout.id);
            leave();
          },
        },
      ],
    });

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
        <EmptyState
          icon="barbell"
          title={t`У цьому дні немає вправ`}
        />
        <View style={styles.emptyActions}>
          <Button title={t`Завершити`} onPress={finish} />
          <Button
            title={t`Скасувати тренування`}
            variant="ghost"
            onPress={discard}
          />
        </View>
        {dialog.element}
      </View>
    );
  }

  const extra = extras[index];
  const youtubeUrl = current.exercise.youtubeUrl;
  const videoId = youtubeVideoId(youtubeUrl);
  const showVideo = videoId !== null && videoOpen;
  // Search links and other pages can't be embedded, so they open in the browser.
  const toggleVideo = () => {
    if (!videoId) WebBrowser.openBrowserAsync(youtubeUrl!);
    else setVideoFor(showVideo ? null : current.id);
  };
  const type = current.exercise.trackingType;
  const currentSet = current.sets.find((s) => s.completedAt === null) ?? null;
  const setNumber = currentSet ? current.sets.indexOf(currentSet) + 1 : current.sets.length;
  // Same set of the previous session (or its last one, if it had fewer sets),
  // shown over the photo as the number to beat.
  const lastSets = extra.last?.sets ?? [];
  const lastSame = lastSets[setNumber - 1] ?? lastSets.at(-1) ?? null;

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

  // The corner button asks whether to come back to this exercise later or drop
  // what's left of it, so it no longer counts as pending.
  const skipExercise = () => {
    if (!currentSet) return goToNextExercise();
    dialog.show({
      title: t`Пропустити вправу?`,
      message: t`${current.exercise.name}: можна виконати пізніше або пропустити зовсім.`,
      icon: 'play-forward',
      buttons: [
        { text: t`Виконати пізніше`, onPress: goToNextExercise },
        {
          text: t`Пропустити зовсім`,
          style: 'destructive',
          onPress: async () => {
            const after = exercises.map((e) =>
              e.id === current.id
                ? { ...e, sets: e.sets.filter((s) => s.completedAt !== null) }
                : e,
            );
            await dropPendingSets(current.id);
            timer.stop();
            const nextIdx = nextIncomplete(after, index + 1);
            if (nextIdx !== null) setCurrentId(exercises[nextIdx].id);
          },
        },
        { text: t`Скасувати`, style: 'cancel' },
      ],
    });
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
    label: lastDoneHere
      ? t`Попередній підхід`
      : t`Попередня вправа`,
    onPress: goBackStep,
    disabled: !lastDoneHere && prevExerciseId === null,
  };
  const canSkipExercise = exercises.length > 1;
  // Tap pauses or resumes; holding fills a ring, turns into stop and asks to finish.
  const pauseStop = {
    icon: paused ? ('play' as const) : ('pause' as const),
    holdIcon: 'stop' as const,
    label: waiting
      ? t`Почати`
      : paused
        ? t`Продовжити`
        : t`Пауза`,
    onPress: togglePause,
    onHold: finish,
  };
  const transport = (next: Omit<ComponentProps<typeof Transport>['right'], 'icon'>) => (
    <>
      <Transport left={back} main={pauseStop} right={{ ...next, icon: 'play-skip-forward' }} />
      {/* Always laid out, only hidden, so pausing doesn't change the card's height. */}
      <Text variant="caption" numberOfLines={1} style={[styles.hint, !paused && styles.hidden]}>
        {waiting
          ? t`Натисніть ▶, щоб почати тренування`
          : t`Утримуйте кнопку, щоб завершити тренування`}
      </Text>
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
    dialog.show({
      title: t`Повернути підхід?`,
      message: t`${label} — знову стане невиконаним.`,
      icon: 'arrow-undo',
      buttons: [
        { text: t`Ні`, style: 'cancel' },
        { text: t`Повернути`, onPress: () => setCompleted(setId, false) },
      ],
    });

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
        {bodyKg !== null && (
          <Text variant="caption" style={styles.subtle}>
            {formatKcal(workoutKcal(exercises, bodyKg))}
          </Text>
        )}
        <Text variant="caption" style={styles.subtle}>
          {doneSets} / {allSets.length} {t`підх.`}
        </Text>
      </Row>
    </>
  );

  const bodyMinHeight = Math.max(bodyHeights.work, bodyHeights.rest);
  const measureBody = (rest: boolean, height: number) =>
    setBodyHeights((h) => {
      const key = rest ? 'rest' : 'work';
      return Math.abs(h[key] - height) < 1 ? h : { ...h, [key]: height };
    });

  let body: ReactNode;
  if (resting) {
    const target = formatSetTarget(current);
    body = (
      <>
        <Text variant="caption" style={[styles.overline, styles.centered]}>
          {pausedTag}
          {t`ВІДПОЧИНОК`}
        </Text>
        <Text variant="title" style={[styles.title, styles.centered]} numberOfLines={2}>
          {current.exercise.name}
        </Text>
        <Text variant="caption" style={[styles.subtle, styles.centered]} numberOfLines={1}>
          {t`Підхід`} {setNumber} {t`з`} {current.sets.length}
          {target ? ` · ${t`ціль`} ${target}` : ''}
        </Text>
        <View style={styles.restRing}>
          <RestRing remainingSec={timer.remainingSec} totalSec={timer.totalSec} />
        </View>
        {transport({ label: t`Пропустити відпочинок`, onPress: timer.stop })}
        <Pressable
          onPress={() => timer.extend(15)}
          style={({ pressed }) => [styles.extend, pressed && styles.pressed]}>
          <Text variant="caption" style={styles.extendText}>
            +15 {t`с`}
          </Text>
        </Pressable>
      </>
    );
  } else {
    body = (
      <>
        <Text variant="caption" style={styles.overline} numberOfLines={1}>
          {pausedTag}
          {currentSet
            ? `${t`Підхід`} ${setNumber} ${t`з`} ${current.sets.length}`
            : current.sets.length > 0
              ? t`Вправу виконано`
              : t`Вправу пропущено`}{' '}
          · {t`Вправа`} {index + 1} {t`з`} {exercises.length}
        </Text>
        <Text variant="title" style={styles.title} numberOfLines={2}>
          {current.exercise.name}
        </Text>
        <Text variant="caption" style={styles.subtle} numberOfLines={2}>
          {t({ message: 'Ціль', context: 'Target' })}: {formatTargets(current)}
          {!currentSet && extra.last
            ? `\n${t`Минулого разу`}: ${extra.last.sets.map((s) => formatSet(type, s)).join(', ')}`
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
                  onPress={() =>
                    undoSet(s.id, `${t`Підхід`} ${i + 1}: ${formatSet(type, s)}`)
                  }
                  style={[styles.chip, done && styles.chipDone, isCurrent && styles.chipCurrent]}>
                  {s.id === prSetId && (
                    <Ionicons name="trophy" size={11} color={colors.accentText} />
                  )}
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
                {/* Next completes the set; after the last one it moves to the next exercise. */}
                {transport({
                  label: t`Наступний підхід`,
                  onPress: () => completeSet(values()),
                  disabled: paused,
                })}
              </>
            )}
          </PlayerSetEditor>
        ) : (
          <>
            {progressBar}
            {transport({
              label: t`Наступна вправа`,
              onPress: goToNextExercise,
              disabled: !canSkipExercise,
            })}
            <View style={styles.actions}>
              <PillButton
                label={t`Ще підхід`}
                icon="add"
                onPress={() => addSet(current.id, false)}
              />
              {workoutDone && (
                <PillButton
                  label={t`Завершити`}
                  icon="flag"
                  primary
                  onPress={finish}
                />
              )}
            </View>
          </>
        )}
      </>
    );
  }

  return (
    <View style={styles.root}>
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
            colors={[colors.accentGradientEnd, colors.accent, '#2E3110', colors.background]}
            locations={[0, 0.35, 0.8, 1]}
            style={[styles.fill, styles.heroPlaceholder]}>
            <Ionicons name="barbell" size={110} color={colors.accentText} />
          </LinearGradient>
        )}
        {!showVideo && lastSame && (
          <Glass tint="rgba(0,0,0,0.55)" style={styles.last}>
            <Text variant="caption" style={styles.lastLabel}>
              {t`МИНУЛОГО РАЗУ`}
            </Text>
            <Text variant="body" style={styles.lastValue} numberOfLines={1}>
              {formatLastSet(type, lastSame)}
            </Text>
          </Glass>
        )}
        {!showVideo && (
          <Glass tint="rgba(0,0,0,0.55)" style={styles.muscles}>
            <MuscleIcon group={current.exercise.muscleGroup} size={52} />
          </Glass>
        )}
      </Animated.View>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        {showVideo ? (
          // Takes the back button's place so a tap there closes the video, not the workout.
          <CircleButton icon="close" background="rgba(0,0,0,0.35)" onPress={toggleVideo} />
        ) : (
          <CircleButton icon="chevron-back" background="rgba(0,0,0,0.35)" onPress={goBack} />
        )}
        <View style={styles.topRight}>
          {youtubeUrl && !showVideo && (
            <CircleButton icon="logo-youtube" background="rgba(0,0,0,0.35)" onPress={toggleVideo} />
          )}
          <Glass tint="rgba(0,0,0,0.35)" style={styles.clock}>
            <Ionicons
              name={paused ? 'pause' : 'time-outline'}
              size={14}
              color={paused ? colors.accent : colors.text}
            />
            <Elapsed workout={workout} style={styles.clockText} />
          </Glass>
        </View>
      </View>

      <PlayerSheet
        topInset={insets.top + 64}
        bottomInset={insets.bottom}
        onCollapsedHeight={setCollapsedHeight}
        progress={sheetProgress}
        header={
          <View style={[styles.player, { paddingBottom: insets.bottom + spacing.xl }]}>
            {canSkipExercise && (
              <Pressable
                onPress={skipExercise}
                hitSlop={6}
                accessibilityLabel={t`Пропустити вправу`}
                style={({ pressed }) => [styles.skipExercise, pressed && styles.pressed]}>
                <Ionicons name="play-forward" size={16} color={colors.text} />
              </Pressable>
            )}
            {/* Rest and exercise views share one height, so switching between them doesn't jump. */}
            <View
              style={{
                minHeight: bodyMinHeight,
                justifyContent: resting ? 'center' : 'flex-start',
              }}>
              <View onLayout={(e) => measureBody(resting, e.nativeEvent.layout.height)}>
                {body}
              </View>
            </View>
          </View>
        }>
        {queue.length > 0 && (
          <SheetItem progress={sheetProgress} index={0}>
            <SectionHeader title={`${t({ message: 'Далі', context: 'Up next' })} · ${queue.length}`} />
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
                    {done && we.sets.length === 0
                      ? t`Пропущено`
                      : done
                        ? bodyKg !== null
                          ? `${t`Виконано`} · ${formatKcal(exerciseKcal(we.exercise.trackingType, we.sets, we.restSec, bodyKg))}`
                          : t`Виконано`
                        : formatTargets(we)}
                  </Text>
                </View>
                {done && (
                  <Ionicons
                    name={we.sets.length === 0 ? 'play-forward-circle' : 'checkmark-circle'}
                    size={22}
                    color={we.sets.length === 0 ? colors.textSecondary : colors.accent}
                  />
                )}
              </Pressable>
            </SheetItem>
          );
        })}

        <SheetItem progress={sheetProgress} index={queue.length + 1}>
          <Button
            title={t`Скасувати тренування`}
            variant="ghost"
            onPress={discard}
          />
        </SheetItem>
      </PlayerSheet>
      {dialog.element}
    </View>
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
  icon?: 'add' | 'flag' | 'play-skip-forward';
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = primary ? colors.accentText : colors.text;
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
  // Sits just above the part of the photo the sheet covers.
  // Same height as the last-time badge opposite, so the bottom corners line up.
  muscles: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 40 + spacing.md,
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  // Bottom-left, opposite the muscle badge; narrow enough to stay clear of it.
  last: {
    position: 'absolute',
    left: spacing.lg,
    bottom: 40 + spacing.md,
    maxWidth: '60%',
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  lastLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  lastValue: { color: colors.text, fontWeight: '800' },
  player: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 10,
    borderTopRightRadius: radius.lg + 10,
    padding: spacing.xl,
    paddingTop: spacing.xxl + spacing.sm, // clear of the sheet handle
    gap: spacing.xs,
  },
  skipExercise: {
    position: 'absolute',
    top: spacing.xxl,
    right: spacing.lg,
    zIndex: 1,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Overline and title stay clear of the skip-exercise button in the corner.
  overline: { color: colors.textSecondary, fontWeight: '600', paddingRight: 44 },
  title: { color: colors.text, paddingRight: 44 },
  // Centred text keeps equal room on both sides of the corner button.
  centered: { textAlign: 'center', paddingHorizontal: 44 },
  restRing: { marginVertical: spacing.lg },
  extend: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  extendText: { color: colors.text, fontWeight: '700' },
  hidden: { opacity: 0 },
  hint: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  subtle: { color: colors.textSecondary },
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
    backgroundColor: colors.surfaceRaised,
  },
  chipDone: { backgroundColor: colors.accent },
  chipCurrent: { borderWidth: 1.5, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  chipTextDone: { color: colors.accentText },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
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
  pillPrimary: { backgroundColor: colors.accent },
  pillSecondary: { backgroundColor: colors.surfaceRaised },
  pillText: { fontWeight: '800', fontSize: fontSize.sm },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
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
  // Video and clock sit in one row with the back button, all 44 high.
  topRight: { flexDirection: 'row', gap: spacing.sm },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  // Tabular digits keep the pill from jittering as the seconds tick.
  clockText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
