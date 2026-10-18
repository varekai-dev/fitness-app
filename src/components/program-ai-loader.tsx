import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Spinner } from '@/components/spinner';
import { Text } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { colors, fontSize, radius, spacing } from '@/theme';

export type LoaderStage = { title: string; detail?: string };

// Each stage stays this long; the last one waits for the answer.
const STAGE_MS = 3200;
// Once the answer is in, the remaining stages tick off this fast.
const FINISH_STAGE_MS = 280;
// The finished checklist stays on screen this long before the plan replaces it.
const FINISH_HOLD_MS = 600;
// Exercise names flick past this fast, as if the AI were sorting through them.
const TICK_MS = 420;
// The bar creeps towards the end over roughly a slow answer's time.
const PROGRESS_MS = 45000;
const ORB = 132;

/**
 * Full-screen wait while AI builds a program: a pulsing orb, exercise names
 * flicking past and a checklist of stages ticked off one by one. The stages
 * are paced by time, since the request gives no progress of its own; once
 * `done`, the rest tick off quickly and `onFinish` hands over to the result.
 */
export function ProgramAiLoader({
  stages,
  exerciseNames,
  attempt,
  attempts,
  done,
  onFinish,
}: {
  stages: LoaderStage[];
  exerciseNames: string[];
  /** Which try is running; from the second one on the AI is redoing the plan. */
  attempt: number;
  attempts: number;
  /** The answer is in. */
  done: boolean;
  onFinish: () => void;
}) {
  const [stage, setStage] = useState(0);
  const last = stages.length - 1;

  // Past the last stage means everything is ticked off.
  const finished = stage > last;

  useEffect(() => {
    if (finished) {
      const timer = setTimeout(onFinish, FINISH_HOLD_MS);
      return () => clearTimeout(timer);
    }
    // The last stage waits for the answer.
    if (stage === last && !done) return;
    const timer = setTimeout(
      () => {
        Haptics.selectionAsync();
        setStage(stage + 1);
      },
      done ? FINISH_STAGE_MS : STAGE_MS,
    );
    return () => clearTimeout(timer);
  }, [stage, last, done, finished, onFinish]);

  // A redo goes back to picking exercises, which is what it does again.
  const [seenAttempt, setSeenAttempt] = useState(attempt);
  if (attempt !== seenAttempt) {
    setSeenAttempt(attempt);
    setStage(Math.min(stage, Math.max(0, last - 2)));
  }

  return (
    <View style={styles.root}>
      <Orb />
      <Ticker names={exerciseNames} />

      <View style={styles.headline}>
        {/* Titles overlap while one leaves and the next comes in, so they don't push each other. */}
        <View style={styles.titleBox}>
          <Animated.View
            key={finished ? 'ready' : stage}
            entering={FadeInDown.duration(350)}
            exiting={FadeOutUp.duration(200)}
            style={styles.slide}>
            <Text variant="title" style={styles.center} numberOfLines={2}>
              {finished
                ? tr('Програма готова!', 'Your program is ready!')
                : `${stages[stage].title}…`}
            </Text>
          </Animated.View>
        </View>
        {attempt > 1 && !done && (
          <Animated.View key={`attempt-${attempt}`} entering={FadeInDown}>
            <Text variant="muted" style={[styles.center, styles.retry]}>
              {tr(
                `План вийшов неповним, AI складає ще раз · спроба ${attempt} з ${attempts}`,
                `The plan came out incomplete, AI is trying again · attempt ${attempt} of ${attempts}`,
              )}
            </Text>
          </Animated.View>
        )}
      </View>

      <Progress done={done} />

      <View style={styles.steps}>
        {stages.map((s, i) => (
          <Step
            key={s.title}
            stage={s}
            state={i < stage ? 'done' : i === stage ? 'active' : 'todo'}
          />
        ))}
      </View>
    </View>
  );
}

function Step({ stage, state }: { stage: LoaderStage; state: 'done' | 'active' | 'todo' }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        {state === 'active' ? (
          <Spinner color={colors.accent} size={28} />
        ) : (
          <Ionicons
            name={state === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={state === 'done' ? colors.accent : colors.textMuted}
          />
        )}
      </View>
      <View style={styles.flex}>
        <Text
          variant="body"
          style={[state === 'todo' && styles.todo, state === 'active' && styles.active]}>
          {stage.title}
        </Text>
        {stage.detail && state !== 'todo' && (
          <Text variant="muted" numberOfLines={1}>
            {stage.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Accent orb with sparkles, waves spreading out of it and a dot circling it. */
function Orb() {
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);
  const wave = useSharedValue(0);

  useEffect(() => {
    pulse.set(
      withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    spin.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1));
    wave.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1));
  }, [pulse, spin, wave]);

  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.get() * 0.08 }] }));
  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const waveA = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - wave.get()),
    transform: [{ scale: 1 + wave.get() * 0.7 }],
  }));
  // The second wave runs half a cycle behind the first.
  const waveB = useAnimatedStyle(() => {
    const t = (wave.get() + 0.5) % 1;
    return { opacity: 0.45 * (1 - t), transform: [{ scale: 1 + t * 0.7 }] };
  });

  return (
    <View style={styles.orb}>
      <Animated.View style={[styles.wave, waveA]} />
      <Animated.View style={[styles.wave, waveB]} />
      <Animated.View style={[styles.orbit, orbit]}>
        <View style={styles.satellite} />
      </Animated.View>
      <Animated.View style={[styles.core, core]}>
        <Ionicons name="sparkles" size={48} color={colors.accentText} />
      </Animated.View>
    </View>
  );
}

/** Library exercise names replacing each other in a pill. */
function Ticker({ names }: { names: string[] }) {
  const [i, setI] = useState(0);
  // Stepping by a prime that doesn't divide the count visits every name, out of alphabetical order.
  const stride = [7, 11, 13].find((p) => names.length % p !== 0) ?? 1;

  useEffect(() => {
    if (names.length < 2) return;
    const timer = setInterval(() => setI((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [names.length]);

  if (names.length === 0) return null;
  return (
    <View style={styles.ticker}>
      <Ionicons name="barbell-outline" size={16} color={colors.accent} />
      <View style={styles.tickerText}>
        <Animated.View
          key={i}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(180)}
          style={styles.slide}>
          <Text variant="secondary" numberOfLines={1}>
            {names[(i * stride) % names.length]}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/** Creeps towards the end without reaching it, since the wait's length is unknown; fills up when done. */
function Progress({ done }: { done: boolean }) {
  const progress = useSharedValue(0.04);

  useEffect(() => {
    progress.set(
      done
        ? withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) })
        : withDelay(
            150,
            withTiming(0.94, { duration: PROGRESS_MS, easing: Easing.out(Easing.cubic) }),
          ),
    );
  }, [progress, done]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  orb: {
    width: ORB * 1.8,
    height: ORB * 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  orbit: {
    position: 'absolute',
    width: ORB + 44,
    height: ORB + 44,
    alignItems: 'center',
  },
  satellite: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: -6,
    backgroundColor: colors.accent,
  },
  core: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: -spacing.lg,
    width: '86%',
  },
  tickerText: { flex: 1, height: fontSize.md + 8, overflow: 'hidden' },
  slide: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  headline: { gap: spacing.xs, alignSelf: 'stretch' },
  // Two lines of the title style.
  titleBox: { height: 2 * (fontSize.xxl + 8) },
  retry: { color: colors.warning },
  bar: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  steps: {
    alignSelf: 'stretch',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: { width: 22, alignItems: 'center' },
  todo: { color: colors.textMuted },
  active: { color: colors.accent },
});
