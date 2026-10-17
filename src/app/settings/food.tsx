import { StyleSheet } from 'react-native';

import { GoalStepper, RecommendationCard } from '@/components/settings';
import { Card, Loading, Screen, Text } from '@/components/ui';
import { getKcalGoal, setKcalGoal } from '@/db/food';
import { loadProfile } from '@/db/profile';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatKcal, KCAL_GOAL_STEP, MAX_KCAL_GOAL, MIN_KCAL_GOAL } from '@/lib/food';
import { tr } from '@/lib/i18n';
import { formatWeightDelta } from '@/lib/labels';
import { formatNumber } from '@/lib/metrics';
import {
  ACTIVITY,
  FAST_WEEKLY_LOSS,
  missingForRecommendation,
  recommendCalories,
  WEIGHT_GOAL,
  weeklyWeightChange,
} from '@/lib/profile';
import { WEIGHT_UNIT } from '@/lib/units';
import { colors, fontSize } from '@/theme';

/** The daily kcal goal with its profile-based recommendation. */
export default function FoodSettingsScreen() {
  const { data } = useDbQuery(() => Promise.all([getKcalGoal(), loadProfile()]));
  if (!data) return <Loading />;
  const [kcalGoal, { profile, latestWeight }] = data;
  const weightKg = latestWeight?.weightKg;
  const kcal = recommendCalories(profile, weightKg);
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
      />
      {kcal && weightKg && <WeightPace tdee={kcal.tdee} goal={kcalGoal} weightKg={weightKg} />}
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

/**
 * How fast the current goal moves the weight against maintenance (the profile's
 * TDEE: weight, height, age, sex and activity), so it follows the stepper.
 */
function WeightPace({ tdee, goal, weightKg }: { tdee: number; goal: number; weightKg: number }) {
  const week = weeklyWeightChange(tdee, goal);
  const share = Math.abs(week) / weightKg;
  const diff = Math.round((goal - tdee) / 10) * 10;
  const stable = formatWeightDelta(week) === '0';
  const balance = stable
    ? tr('на рівні підтримки', 'at maintenance')
    : diff < 0
      ? tr(`дефіцит ${formatKcal(-diff)} ккал/день`, `${formatKcal(-diff)} kcal/day deficit`)
      : tr(`профіцит ${formatKcal(diff)} ккал/день`, `${formatKcal(diff)} kcal/day surplus`);

  return (
    <Card>
      <Text variant="overline">{tr('Темп при цій нормі', 'Pace at this goal')}</Text>
      <Text variant="title">
        {stable ? tr('Вага стабільна', 'Weight holds') : formatWeightDelta(week)}
        {!stable && (
          <Text style={styles.unit}>
            {' '}
            {WEIGHT_UNIT}/{tr('тиждень', 'week')}
          </Text>
        )}
      </Text>
      <Text variant="muted">
        {tr('Підтримка', 'Maintenance')} ≈ {formatKcal(Math.round(tdee / 10) * 10)}{' '}
        {tr('ккал', 'kcal')} · {balance}
        {!stable &&
          ` · ${formatWeightDelta((week * 30) / 7)} ${WEIGHT_UNIT}/${tr('міс.', 'mo')} · ${formatNumber(share * 100, 1)}% ${tr('ваги на тиждень', 'of weight a week')}`}
      </Text>
      {week < 0 && share > FAST_WEEKLY_LOSS && (
        <Text style={styles.warning}>
          {tr(
            'Швидше за 1% ваги на тиждень: разом із жиром підуть мʼязи.',
            'Faster than 1% of weight a week: muscle goes along with fat.',
          )}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  unit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  warning: { color: colors.warning, fontSize: fontSize.sm },
});
