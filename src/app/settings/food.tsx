import { StyleSheet, View } from 'react-native';

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
  if (!data) return <Loading />;
  const [kcalGoal, { profile, latestWeight }] = data;
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
        {kcal && scale && <WeightPace tdee={kcal.tdee} goal={kcalGoal} scale={scale} />}
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

/**
 * Where the goal sits between too little and too much against maintenance (the
 * profile's TDEE: weight, height, age, sex and activity), and how fast it moves
 * the weight, so both follow the stepper.
 */
function WeightPace({ tdee, goal, scale }: { tdee: number; goal: number; scale: CalorieScale }) {
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
      <View style={styles.track}>
        <View style={styles.bar}>
          {scale.segments.map((s) => (
            <View
              key={s.zone + s.from}
              style={{ flex: s.to - s.from, backgroundColor: ZONE_COLOR[s.zone] }}
            />
          ))}
        </View>
        <View style={[styles.tick, { left: at(tdee) }]} />
        <View style={[styles.marker, { left: at(goal), borderColor: ZONE_COLOR[zone] }]} />
      </View>
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

const MARKER = 16;

const styles = StyleSheet.create({
  pace: { gap: spacing.xs, marginTop: spacing.md },
  track: { height: MARKER, justifyContent: 'center', marginBottom: spacing.xs },
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
    height: MARKER,
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
    borderWidth: 3,
    backgroundColor: colors.text,
  },
  advice: { fontSize: fontSize.sm },
});
