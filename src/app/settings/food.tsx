import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Loading, Screen, Text } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { formatWeightDelta } from '@/lib/labels';
import {
  ACTIVITY,
  calorieScale,
  calorieZone,
  missingForRecommendation,
  recommendCalories,
  WEIGHT_GOAL,
  weeklyWeightChange,
  type CalorieScale,
  type CalorieZone,
} from '@/lib/profile';
import { WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme';

/** The daily kcal goal with its profile-based recommendation. */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), loadProfile()]));
  // The value under the finger while the scale is dragged, saved on release. It
  // stays shown only until the saved goal moves away from the one it started at.
  const [draft, setDraft] = useState<{ value: number; from: number } | null>(null);
  if (!data) return <Loading />;
  const [savedGoal, { profile, latestWeight }] = data;
  const kcalGoal = draft?.from === savedGoal ? draft.value : savedGoal;
  const weightKg = latestWeight?.weightKg;
  const kcal = recommendCalories(profile, weightKg);
  const scale =
    kcal && weightKg && profile.sex ? calorieScale(kcal.tdee, weightKg, profile.sex) : undefined;
  const activity = tr(
    `${ACTIVITY[profile.activity].label.toLowerCase()} активність`,
    `${ACTIVITY[profile.activity].label.toLowerCase()} activity`,
  );

  return (
    <Screen title={tr('Харчування', 'Food')}>
      <GoalStepper
        title={tr('Денна норма', 'Daily goal')}
        unit={tr('ккал', 'kcal')}
        value={kcalGoal}
        step={KCAL_GOAL_STEP}
        min={MIN_KCAL_GOAL}
        max={MAX_KCAL_GOAL}
        format={formatKcal}
        onChange={setKcalGoal}
        valueColor={scale && ZONE_COLOR[calorieZone(scale, kcalGoal)]}>
        {kcal && scale && (
          <WeightPace
            tdee={kcal.tdee}
            goal={kcalGoal}
            scale={scale}
            onDrag={(value) => setDraft({ value, from: savedGoal })}
            onRelease={(value) => (value === savedGoal ? setDraft(null) : setKcalGoal(value))}
          />
        )}
      </GoalStepper>
      <RecommendationCard
        value={kcal?.kcal ?? null}
        goal={kcalGoal}
        unit={tr('ккал', 'kcal')}
        format={formatKcal}
        details={
          kcal
            ? `${WEIGHT_GOAL[profile.goal].label} · ${activity} · ${kcal.age} ${tr('р.', 'y.o.')}`
            : ''
        }
        missing={missingForRecommendation(profile, weightKg).join(', ')}
        onAdopt={setKcalGoal}
      />
    </Screen>
  );
}

const ZONE_COLOR: Record<CalorieZone, string> = {
  danger: colors.danger,
  ok: colors.success,
  warning: colors.warning,
};

/** A kcal goal on the scale's step grid, within both the scale and the allowed goals. */
const snapGoal = (kcal: number, scale: CalorieScale) =>
  Math.min(
    Math.max(Math.round(kcal / KCAL_GOAL_STEP) * KCAL_GOAL_STEP, MIN_KCAL_GOAL, scale.min),
    MAX_KCAL_GOAL,
    scale.max,
  );

/**
 * Where the goal sits between too little and too much against maintenance (the
 * profile's TDEE: weight, height, age, sex and activity), and how fast it moves
 * the weight. Tapping or dragging the scale moves the goal.
 */
function WeightPace({
  tdee,
  goal,
  scale,
  onDrag,
  onRelease,
}: {
  tdee: number;
  goal: number;
  scale: CalorieScale;
  onDrag: (kcal: number) => void;
  onRelease: (kcal: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const valueAt = (x: number) =>
    snapGoal(scale.min + (x / (width || 1)) * (scale.max - scale.min), scale);
  const drag = (x: number) => {
    const kcal = valueAt(x);
    if (kcal === goal) return;
    Haptics.selectionAsync();
    onDrag(kcal);
  };
  // Horizontal drags move the goal and vertical ones still scroll the screen.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onUpdate((e) => drag(e.x))
    .onEnd((e) => onRelease(valueAt(e.x)));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      Haptics.selectionAsync();
      onRelease(valueAt(e.x));
    });

  const week = weeklyWeightChange(tdee, goal);
  const diff = Math.round((goal - tdee) / 10) * 10;
  const stable = formatWeightDelta(week) === '0';
  const zone = calorieZone(scale, goal);
  const at = (kcal: number): `${number}%` => {
    const share = (kcal - scale.min) / (scale.max - scale.min);
    return `${Math.min(Math.max(share, 0), 1) * 100}%`;
  };
  const balance = stable
    ? tr('на рівні підтримки', 'at maintenance')
    : diff < 0
      ? tr(`дефіцит ${formatKcal(-diff)} ккал/день`, `${formatKcal(-diff)} kcal/day deficit`)
      : tr(`профіцит ${formatKcal(diff)} ккал/день`, `${formatKcal(diff)} kcal/day surplus`);
  const advice = {
    danger:
      diff < 0
        ? tr(
            'Забагато: швидше за 1% ваги на тиждень підуть і мʼязи, а не лише жир.',
            'Too little: faster than 1% of weight a week costs muscle, not only fat.',
          )
        : tr('Забагато: набір піде переважно в жир.', 'Too much: the gain goes mostly to fat.'),
    warning: tr('Швидкий набір: частина піде в жир.', 'Fast gain: part of it goes to fat.'),
    ok: null,
  }[zone];

  return (
    <View style={styles.pace}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <View style={styles.bar} pointerEvents="none">
            {scale.segments.map((s) => (
              <View
                key={s.zone + s.from}
                style={{ flex: s.to - s.from, backgroundColor: ZONE_COLOR[s.zone] }}
              />
            ))}
          </View>
          <View style={[styles.tick, { left: at(tdee) }]} pointerEvents="none" />
          <View
            style={[styles.marker, { left: at(goal), borderColor: ZONE_COLOR[zone] }]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>
      <Text variant="heading" style={{ color: ZONE_COLOR[zone] }}>
        {stable
          ? tr('Вага стабільна', 'Weight holds')
          : `${formatWeightDelta(week)} ${WEIGHT_UNIT}/${tr('тиждень', 'week')} · ${formatWeightDelta((week * 30) / 7)} ${WEIGHT_UNIT}/${tr('міс.', 'mo')}`}
      </Text>
      <Text variant="muted">
        {tr('Підтримка', 'Maintenance')} ≈ {formatKcal(Math.round(tdee / 10) * 10)}{' '}
        {tr('ккал', 'kcal')} · {balance}
      </Text>
      {advice && <Text style={[styles.advice, { color: ZONE_COLOR[zone] }]}>{advice}</Text>}
    </View>
  );
}

const MARKER = 24;

const styles = StyleSheet.create({
  pace: { gap: spacing.xs, marginTop: spacing.md },
  // Taller than the bar so the finger finds it.
  track: { height: MARKER + spacing.lg, justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    opacity: 0.85,
  },
  tick: {
    position: 'absolute',
    width: 2,
    height: MARKER - 6,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
  },
  marker: {
    position: 'absolute',
    width: MARKER,
    height: MARKER,
    marginLeft: -MARKER / 2,
    borderRadius: MARKER / 2,
    borderWidth: 4,
    backgroundColor: colors.text,
  },
  advice: { fontSize: fontSize.sm },
});
